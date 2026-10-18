package com.tcp.cleanmanagement.service;

import com.tcp.cleanmanagement.config.AiProperties;
import com.tcp.cleanmanagement.dto.AiJudgement;
import com.tcp.cleanmanagement.dto.AiObservation;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;

@Component
public class PythonAiModelClient implements AiModelClient, AutoCloseable {
    private final AiProperties properties;
    private final JsonMapper mapper;
    private final ExecutorService readerThread = Executors.newSingleThreadExecutor(task -> {
        Thread thread = new Thread(task, "restroom-ai-output"); thread.setDaemon(true); return thread;
    });
    private Process process;
    private BufferedReader output;
    private BufferedWriter input;
    private String modelVersion = "";
    private String lastError = "";
    private String sessionId = "";

    public PythonAiModelClient(AiProperties properties, JsonMapper mapper) {
        this.properties = properties; this.mapper = mapper;
    }

    @Override
    public synchronized void start() {
        if (!properties.isEnabled() || process != null && process.isAlive()) return;
        stopProcess();
        try {
            Path directory = Path.of(properties.getDirectory()).toAbsolutePath().normalize();
            if (!Files.isRegularFile(directory.resolve("worker.py"))) {
                Path fromRoot = Path.of("backend").resolve(properties.getDirectory()).toAbsolutePath().normalize();
                if (Files.isRegularFile(fromRoot.resolve("worker.py"))) directory = fromRoot;
            }
            if (!Files.isRegularFile(directory.resolve("worker.py"))) throw new IOException("AI worker directory is missing");
            String python = properties.getPython();
            if (python == null || python.isBlank()) {
                python = "python3";
                Path parent = directory;
                for (int i = 0; parent != null && i < 4; i++, parent = parent.getParent()) {
                    Path candidate = parent.resolve(".venv/bin/python");
                    if (Files.isExecutable(candidate)) { python = candidate.toString(); break; }
                }
            }
            ProcessBuilder builder = new ProcessBuilder(python, "-u", directory.resolve("worker.py").toString());
            builder.directory(directory.toFile()).redirectError(ProcessBuilder.Redirect.INHERIT);
            builder.environment().put("OMP_NUM_THREADS", "2");
            builder.environment().put("OPENBLAS_NUM_THREADS", "2");
            builder.environment().put("PYTHONDONTWRITEBYTECODE", "1");
            process = builder.start();
            output = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8));
            input = new BufferedWriter(new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8));
            var ready = mapper.readTree(readLine());
            if (!"ready".equals(ready.path("type").asText()) || ready.path("models_loaded").asInt() != 5) {
                throw new IOException("AI worker did not load five models");
            }
            modelVersion = ready.path("model_version").asText();
            sessionId = UUID.randomUUID().toString();
            lastError = "";
        } catch (Exception error) {
            lastError = "AI model startup failed; check Python, requirements and bundled models";
            stopProcess();
            throw new IllegalStateException(lastError, error);
        }
    }

    @Override
    public synchronized AiJudgement predict(AiObservation observation) {
        if (!properties.isEnabled()) throw new IllegalStateException("AI is disabled");
        start();
        try {
            input.write(mapper.writeValueAsString(observation)); input.newLine(); input.flush();
            var reply = mapper.readTree(readLine());
            if (!observation.id().equals(reply.path("id").asText())) throw new IOException("AI response ID mismatch");
            if (!reply.path("ok").asBoolean()) throw new AiInputException(reply.path("error").asText());
            AiJudgement result = mapper.treeToValue(reply.get("result"), AiJudgement.class);
            if (!observation.deviceId().equals(result.deviceId()) || result.level() == null
                    || result.headline() == null || result.ready() == null || result.alerts() == null
                    || !modelVersion.equals(result.modelVersion())) throw new IOException("Invalid AI result contract");
            lastError = "";
            return result;
        } catch (AiInputException error) {
            throw error;
        } catch (Exception error) {
            lastError = "AI inference unavailable; queued samples will be retried";
            stopProcess();
            throw new IllegalStateException(lastError, error);
        }
    }

    private String readLine() throws Exception {
        Future<String> pending = readerThread.submit(output::readLine);
        try {
            String line = pending.get(Math.max(1, properties.getTimeoutSeconds()), TimeUnit.SECONDS);
            if (line == null || line.length() > 131072) throw new IOException("AI worker closed or sent an invalid response");
            return line;
        } catch (Exception error) {
            pending.cancel(true); stopProcess(); throw error;
        }
    }

    @Override
    public synchronized Map<String, Object> status() {
        return Map.of("enabled", properties.isEnabled(), "loaded", process != null && process.isAlive(),
                "modelVersion", modelVersion, "sessionId", sessionId, "error", lastError);
    }

    private void stopProcess() {
        if (process != null) { process.destroyForcibly(); process = null; }
        if (output != null) try { output.close(); } catch (IOException ignored) {}
        if (input != null) try { input.close(); } catch (IOException ignored) {}
        output = null; input = null;
    }

    @PreDestroy
    public synchronized void close() { stopProcess(); readerThread.shutdownNow(); }

    public static class AiInputException extends RuntimeException {
        public AiInputException(String message) { super(message); }
    }
}
