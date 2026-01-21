# ===========================================
# Stock Tracker Dev Container
# ===========================================
# Ubuntu 24.04 (matches production VM)
# Runtimes: .NET 8, Go 1.22, Node.js 20, Python 3.12
# CLIs: infisical, gh, az, supabase, vercel, oci, claude, docker
# ===========================================

FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

ENV DEBIAN_FRONTEND=noninteractive

ARG DOTNET_VERSION=8.0
ARG GO_VERSION=1.22.5
ARG NODE_VERSION=20

# System packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl wget git unzip zip jq \
    ca-certificates gnupg openssh-client \
    python3-pip python3-venv python3-dev \
    sudo vim nano \
    && rm -rf /var/lib/apt/lists/*

# .NET 8 SDK
RUN wget https://dot.net/v1/dotnet-install.sh -O dotnet-install.sh \
    && chmod +x dotnet-install.sh \
    && ./dotnet-install.sh --channel ${DOTNET_VERSION} --install-dir /usr/share/dotnet \
    && rm dotnet-install.sh \
    && ln -s /usr/share/dotnet/dotnet /usr/local/bin/dotnet

ENV DOTNET_ROOT=/usr/share/dotnet
ENV PATH="${PATH}:/usr/share/dotnet:/root/.dotnet/tools"

# Go 1.22
RUN wget https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz \
    && tar -C /usr/local -xzf go${GO_VERSION}.linux-amd64.tar.gz \
    && rm go${GO_VERSION}.linux-amd64.tar.gz

ENV PATH="${PATH}:/usr/local/go/bin:/root/go/bin"
ENV GOPATH=/root/go

# Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g npm@latest \
    && rm -rf /var/lib/apt/lists/*

# Python pip (use system pip as-is, Ubuntu 24.04 has recent version)

# GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Azure CLI
RUN curl -sL https://aka.ms/InstallAzureCLIDeb | bash

# Infisical CLI
RUN curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh' | bash \
    && apt-get update && apt-get install -y infisical \
    && rm -rf /var/lib/apt/lists/*

# NPM global packages: Vercel, Claude, TypeScript
RUN npm install -g vercel @anthropic-ai/claude-code typescript ts-node pnpm yarn

# Supabase CLI (no longer supports npm global install)
RUN curl -fsSL https://supabase.com/install.sh | bash -s -- -b /usr/local/bin

# Oracle Cloud CLI
RUN pip3 install oci-cli --break-system-packages

# Create auth directories
RUN mkdir -p /root/.config/gh /root/.azure /root/.claude /root/.cursor \
    /root/.config/cursor /root/.infisical /root/.oci /root/.config/grafanactl \
    /root/.local/share/com.vercel.cli /root/.supabase

WORKDIR /workspaces
SHELL ["/bin/bash", "-c"]
