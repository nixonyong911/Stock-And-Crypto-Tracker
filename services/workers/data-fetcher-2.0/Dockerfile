# Data Fetcher 2.0 - Centralized Multi-Provider Data Fetcher (.NET Web API + Worker)
# Multi-stage build for optimized image size

# Build stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy common library first
COPY ["common/StockTracker.Common/StockTracker.Common.csproj", "common/StockTracker.Common/"]

# Copy project file and restore dependencies
COPY ["workers/data-fetcher-2.0/src/DataFetcher.Worker/DataFetcher.Worker.csproj", "workers/data-fetcher-2.0/src/DataFetcher.Worker/"]
RUN dotnet restore "workers/data-fetcher-2.0/src/DataFetcher.Worker/DataFetcher.Worker.csproj"

# Copy all source code
COPY common/ common/
COPY workers/data-fetcher-2.0/src/ workers/data-fetcher-2.0/src/

# Build and publish
WORKDIR "/src/workers/data-fetcher-2.0/src/DataFetcher.Worker"
RUN dotnet publish -c Release -o /app/publish /p:UseAppHost=false

# Runtime stage - using ASP.NET runtime for web API
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN adduser --disabled-password --gecos '' appuser && chown -R appuser /app
USER appuser

# Copy published application
COPY --from=build /app/publish .

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD curl -f http://localhost:8080/health/live || exit 1

ENTRYPOINT ["dotnet", "DataFetcher.Worker.dll"]
