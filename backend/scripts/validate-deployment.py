#!/usr/bin/env python3
"""Exercise the repository Nginx TLS configuration with isolated ports and test certificates."""
import argparse, http.server, json, os, pathlib, socket, ssl, subprocess, tempfile, threading, time, urllib.error, urllib.request

def port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0)); return sock.getsockname()[1]

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs): return None

class Backend(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        data=json.dumps({"forwardedFor":self.headers.get("X-Forwarded-For"),"scheme":self.headers.get("X-Forwarded-Proto")}).encode()
        self.send_response(200); self.send_header("Content-Type","application/json"); self.end_headers(); self.wfile.write(data)
    def log_message(self,*args): pass

def main():
    parser=argparse.ArgumentParser(); parser.add_argument("--nginx",required=True); args=parser.parse_args()
    project=pathlib.Path(__file__).resolve().parents[2]
    with tempfile.TemporaryDirectory(prefix="tcp-tls-validation-") as directory:
        root=pathlib.Path(directory); root.chmod(0o700); cert=root/"fullchain.pem"; key=root/"privkey.pem"
        subprocess.run(["openssl","req","-x509","-newkey","rsa:2048","-sha256","-days","1","-nodes","-subj","/CN=localhost","-addext","subjectAltName=DNS:localhost,IP:127.0.0.1","-keyout",str(key),"-out",str(cert)],check=True,capture_output=True)
        key.chmod(0o600); http_port,tls_port=port(),port()
        backend=http.server.ThreadingHTTPServer(("127.0.0.1",0),Backend); thread=threading.Thread(target=backend.serve_forever,daemon=True); thread.start()
        configuration=(project/"frontend/nginx.conf").read_text().replace("listen 80;",f"listen 127.0.0.1:{http_port};").replace("listen 443 ssl;",f"listen 127.0.0.1:{tls_port} ssl;")
        configuration=configuration.replace("/etc/nginx/tls/fullchain.pem",str(cert)).replace("/etc/nginx/tls/privkey.pem",str(key)).replace("http://backend:8080",f"http://127.0.0.1:{backend.server_port}")
        configuration=configuration.replace("/usr/share/nginx/html",str(project/"frontend/dist"))
        config=root/"nginx.conf"; config.write_text(f"pid {root}/nginx.pid;\nerror_log stderr;\nevents {{}}\nhttp {{ access_log off;\n{configuration}\n}}\n")
        nginx=str(pathlib.Path(args.nginx).resolve())
        subprocess.run([nginx,"-p",str(root)+"/","-c",str(config),"-t"],check=True,capture_output=True)
        process=subprocess.Popen([nginx,"-p",str(root)+"/","-c",str(config),"-g","daemon off;"],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
        try:
            context=ssl.create_default_context(cafile=str(cert)); opener=urllib.request.build_opener(urllib.request.HTTPSHandler(context=context),NoRedirect())
            deadline=time.monotonic()+5
            while True:
                try:
                    response=opener.open(urllib.request.Request(f"https://localhost:{tls_port}/api/test",headers={"X-Forwarded-For":"203.0.113.99"}),timeout=1); break
                except (OSError,urllib.error.URLError):
                    if time.monotonic()>deadline: raise
                    time.sleep(0.05)
            assert response.headers["Strict-Transport-Security"]=="max-age=31536000"
            body=json.load(response); assert body=={"forwardedFor":"127.0.0.1","scheme":"https"},body
            try: opener.open(f"http://127.0.0.1:{http_port}/login?next=dashboard",timeout=2); raise AssertionError("HTTP did not redirect")
            except urllib.error.HTTPError as error: assert error.code==308 and error.headers["Location"].startswith("https://"),error
            try: opener.open(urllib.request.Request(f"https://localhost:{tls_port}/api/test",data=b"x"*20000,method="POST"),timeout=2); raise AssertionError("Oversized request was accepted")
            except urllib.error.HTTPError as error: assert error.code==413,error
            print("Nginx configuration, verified HTTPS, HTTP redirect, HSTS, trusted proxy headers and request size limit passed")
        finally:
            process.terminate()
            try:process.wait(timeout=5)
            except subprocess.TimeoutExpired:process.kill();process.wait()
            backend.shutdown();backend.server_close()

if __name__=="__main__":main()
