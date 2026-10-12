import os
import glob
import codecs

src_dir = r'c:\Users\KBU\Desktop\hmy_github\TCP_Clean_Management\backend\src\main\java'

for filepath in glob.glob(src_dir + '/**/*.java', recursive=True):
    try:
        # Read the file
        with open(filepath, 'rb') as f:
            content = f.read()
        
        # Decode trying different encodings
        if content.startswith(codecs.BOM_UTF8):
            text = content[len(codecs.BOM_UTF8):].decode('utf-8')
        else:
            try:
                text = content.decode('utf-8')
            except:
                text = content.decode('euc-kr') # fallback for windows korea
                
        # Write back as pure utf-8 without BOM
        with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
            f.write(text)
    except Exception as e:
        print(f'Error processing {filepath}: {e}')
