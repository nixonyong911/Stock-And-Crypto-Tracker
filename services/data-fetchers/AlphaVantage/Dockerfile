# Alpha Vantage Data Fetcher Service
# Multi-stage build for optimized image size

# Build stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy project file and restore dependencies
COPY ["src/AlphaVantage.Worker/AlphaVantage.Worker.csproj", "AlphaVantage.Worker/"]
RUN dotnet restore "AlphaVantage.Worker/AlphaVantage.Worker.csproj"

# Copy source code
COPY src/ .

# Build and publish
WORKDIR "/src/AlphaVantage.Worker"
RUN dotnet publish -c Release -o /app/publish /p:UseAppHost=false

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# Create non-root user for security
RUN adduser --disabled-password --gecos '' appuser && chown -R appuser /app
USER appuser

# Copy published application
COPY --from=build /app/publish .

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD pgrep -f dotnet || exit 1

ENTRYPOINT ["dotnet", "AlphaVantage.Worker.dll"]

