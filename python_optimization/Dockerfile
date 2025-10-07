FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# Install system dependencies and NVIDIA Container Toolkit runtime hooks
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        python3-venv \
        python3-dev \
        git \
        curl \
        gnupg \
        ca-certificates \
        build-essential \
        libsndfile1 \
        libgl1 && \
    rm -rf /var/lib/apt/lists/*

# Install NVIDIA Container Toolkit repository (for compatibility inside the container)
RUN set -eux; \
    distribution=$(. /etc/os-release;echo $ID$VERSION_ID); \
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg; \
    curl -fsSL https://nvidia.github.io/libnvidia-container/${distribution}/libnvidia-container.list | \
        sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#' | \
        tee /etc/apt/sources.list.d/nvidia-container-toolkit.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends nvidia-container-toolkit; \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY python_optimization/requirements.txt requirements.txt

RUN python3 -m pip install --upgrade pip && \
    pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cu121 -r requirements.txt

COPY python_optimization/ ./python_optimization/

ENV PYTHONPATH=/app

EXPOSE 8000

CMD ["python3", "-m", "python_optimization"]
