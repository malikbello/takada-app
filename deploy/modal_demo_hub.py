"""The Tákàdá demo hub (the judges' sandbox, NAIC 2026): the same server as a clinic hub, run
in the cloud (ROLE=cloud), drafting with the fine-tuned N-ATLaS on a GPU (phc-scribe
deploy/modal_demo.py).

- Anyone may join with the public code (DEMO_CODE); each phone gets a demo clinic of its own.
- AI drafts are capped per phone and per day (DEMO_DRAFTS_PER_HOUR, DEMO_DRAFTS_PER_DAY), which
  keeps the GPU inside the free credit. Demo recordings and transcripts go after a day.
- One small CPU container stays up while judges evaluate, so phones stay paired. Its data lives
  on the container disk: after a restart, phones join again and resend (apps/mobile lib/demo.ts).

    pnpm --filter @takada/server build        # apps/server/dist/main.js, a single bundle
    modal deploy deploy/modal_demo_hub.py     # https://malikbello--takada-demo-hub.modal.run
"""

import os
import subprocess

import modal

image = (
    modal.Image.from_registry("node:22.20-bookworm-slim", add_python="3.12")
    .run_commands("mkdir -p /data/audio")
    .env(
        {
            "NODE_ENV": "production",
            "ROLE": "cloud",
            "NODE_NAME": "demo-hub",
            "HOST": "0.0.0.0",
            "PORT": "8080",
            "DB_PATH": "/data/takada.sqlite",
            "AUDIO_DIR": "/data/audio",
            "PHC_SCRIBE_URL": "https://malikbello--takada-demo-api.us-east.modal.run",
            "CORS_ORIGINS": "https://takada-app.vercel.app",
            "DEMO_CODE": "TAKADA26",
            "DEMO_DRAFTS_PER_HOUR": "10",
            "DEMO_DRAFTS_PER_DAY": "25",
            "RETAIN_AUDIO_DAYS": "1",
            "RETAIN_UNCONFIRMED_DAYS": "1",
            "WORKERS": "1",
        }
    )
    .add_local_file("apps/server/dist/main.js", "/app/dist/main.js")
)

app = modal.App("takada-demo-hub")


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("takada-demo")],  # ADMIN_TOKEN, PHC_SCRIBE_API_KEY
    cpu=0.125,
    memory=512,
    min_containers=1,  # while judges evaluate (to 20 Oct 2026); then 0
    max_containers=1,  # one SQLite database
    timeout=86400,
)
@modal.concurrent(max_inputs=50)
@modal.web_server(8080, startup_timeout=60, label="takada-demo-hub")
def hub() -> None:
    subprocess.Popen(
        ["node", "--disable-warning=ExperimentalWarning", "/app/dist/main.js"],
        cwd="/app",
        env=dict(os.environ),
    )
