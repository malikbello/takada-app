# llama.cpp server for the clinic hub, built on the CPU from the exact release the shipped
# model was evaluated with (phc-scribe deploy/modal_gguf.py; the GGUF's manifest records
# llama.cpp commit 8330e9696708fcfd5d465cdbd333e4c5a67e2808 = tag b11387). Prebuilt images
# are not published for that release, and an unpinned `:server` image would serve a
# different build from the one the benchmark measured.
#
#   docker build -f deploy/llm.Dockerfile -t takada-llm:b11387 deploy
ARG LLAMA_CPP_TAG=b11387
ARG LLAMA_CPP_COMMIT=8330e9696708fcfd5d465cdbd333e4c5a67e2808

FROM debian:trixie-slim AS build
ARG LLAMA_CPP_TAG
ARG LLAMA_CPP_COMMIT
RUN apt-get update && apt-get install -y --no-install-recommends \
      git cmake build-essential ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch "$LLAMA_CPP_TAG" https://github.com/ggml-org/llama.cpp /src \
 && test "$(git -C /src rev-parse HEAD)" = "$LLAMA_CPP_COMMIT"
# GGML_NATIVE=OFF: portable x86-64 binary (the hub may not be the build machine); the CPU
# backends are loaded at run time for the instructions the hub's CPU has.
RUN cmake -S /src -B /build -DCMAKE_BUILD_TYPE=Release -DGGML_NATIVE=OFF \
      -DGGML_BACKEND_DL=ON -DGGML_CPU_ALL_VARIANTS=ON -DLLAMA_CURL=OFF \
      -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF \
 && cmake --build /build --config Release -j "$(nproc)" --target llama-server
RUN mkdir /out && cp -a /build/bin/llama-server /build/bin/*.so* /out/

FROM debian:trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 curl \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --uid 10002 --no-create-home llm
COPY --from=build /out/ /app/
ENV LD_LIBRARY_PATH=/app
USER llm
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=180s CMD curl -fs http://127.0.0.1:8080/health
ENTRYPOINT ["/app/llama-server"]
