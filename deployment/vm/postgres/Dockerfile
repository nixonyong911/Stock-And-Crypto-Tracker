FROM postgres:17

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    postgresql-server-dev-17 \
    libcurl4-openssl-dev \
    libicu-dev \
    git \
    ca-certificates \
  && git clone --branch v0.20.2 --depth 1 https://github.com/supabase/pg_net.git /tmp/pg_net \
  && cd /tmp/pg_net \
  && make && make install \
  && cd / && rm -rf /tmp/pg_net \
  && apt-get purge -y build-essential postgresql-server-dev-17 git \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*

COPY 01-init-extensions.sql /docker-entrypoint-initdb.d/
COPY 02-init-roles-and-config.sh /docker-entrypoint-initdb.d/
