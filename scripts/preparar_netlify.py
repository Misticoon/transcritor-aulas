#!/usr/bin/env python3
"""Prepara o deploy manual do Netlify a partir de .env (sem dependências)."""
import json
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env"
OUTPUT = ROOT / "deploy-netlify"
FILES = ("index.html", "style.css", "app.js", "_headers", "favicon.svg")
VARIABLES = ("PRIMARY_WORKER_URL", "BACKUP_WORKER_URL")


def load_env(path):
    if not path.is_file():
        raise ValueError("Arquivo .env não encontrado. Copie .env.example para .env e configure as URLs.")
    env = {}
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export "):].strip()
        if "=" not in line:
            raise ValueError(f"Linha {number} inválida em .env: esperado NOME=valor")
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
            value = value[1:-1]
        env[key] = value
    return env


def valid_url(name, raw):
    if not raw:
        raise ValueError(f"Informe {name} no .env")
    url = urlsplit(raw)
    if url.scheme != "https" or not url.netloc or not url.hostname:
        raise ValueError(f"{name} precisa ser URL HTTPS completa, por exemplo https://exemplo.workers.dev/")
    if url.username or url.password or url.query or url.fragment:
        raise ValueError(f"{name} não pode conter credenciais, query string ou fragmento")
    if 'seu-' in url.hostname or 'exemplo.' in url.hostname:
        raise ValueError(f"Troque a URL de exemplo em {name} pelo endereço do seu Worker")
    return raw.rstrip("/") + "/"


def main():
    settings = load_env(ENV_FILE)
    public = {name: valid_url(name, settings.get(name, "")) for name in VARIABLES}
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        (OUTPUT / name).write_bytes((ROOT / name).read_bytes())
    # Importante: conteúdo é público e consultável no navegador.
    # JSON serializado impede a inserção de código nas URLs.
    js = "window.TRANSCRITOR_CONFIG = Object.freeze(" + json.dumps(public, ensure_ascii=True) + ");\n"
    (OUTPUT / "config.js").write_text(js, encoding="utf-8")
    print("Deploy preparado em:", OUTPUT)
    print("Arquivos:", ", ".join([*FILES, "config.js"]))
    print("Arraste a pasta deploy-netlify para Netlify > Deploys > deploy manual.")
    print("Obs.: config.js é público quando publicado, assim como as URLs dos Workers.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as exc:
        raise SystemExit(f"Erro: {exc}")
