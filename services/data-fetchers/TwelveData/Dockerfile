# TwelveData Data Fetcher Service (.NET Worker)
# Multi-stage build for optimized image size

# Build stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy common library first
COPY ["common/StockTracker.Common/StockTracker.Common.csproj", "common/StockTracker.Common/"]

# Copy project file and restore dependencies
COPY ["data-fetchers/TwelveData/src/TwelveData.Worker/TwelveData.Worker.csproj", "data-fetchers/TwelveData/src/TwelveData.Worker/"]
RUN dotnet restore "data-fetchers/TwelveData/src/TwelveData.Worker/TwelveData.Worker.csproj"

# Copy all source code
COPY common/ common/
COPY data-fetchers/TwelveData/src/ data-fetchers/TwelveData/src/

# Build and publish
WORKDIR "/src/data-fetchers/TwelveData/src/TwelveData.Worker"
RUN dotnet publish -c Release -o /app/publish /p:UseAppHost=false

# Runtime stage
FROM mcr.microsoft.com/dotnet/runtime:8.0 AS runtime
WORKDIR /app

# Create non-root user for security
RUN adduser --disabled-password --gecos '' appuser && chown -R appuser /app
USER appuser

# Copy published application
COPY --from=build /app/publish .

ENTRYPOINT ["dotnet", "TwelveData.Worker.dll"]

