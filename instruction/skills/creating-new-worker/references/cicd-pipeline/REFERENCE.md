# CI/CD Pipeline Reference

File: `.github/workflows/deploy-vm.yml`

## 1. Add Trigger Path
```yaml
paths:
  - 'services/data-fetchers/YourWorker/**'
```

## 2. Add Change Detection
```yaml
yourworker:
  - 'services/data-fetchers/YourWorker/**'
  - 'services/common/**'
```

## 3. Add Build Step
```yaml
- name: Build YourWorker image
  if: needs.detect-changes.outputs.yourworker == 'true'
  uses: docker/build-push-action@v5
  with:
    context: services/
    file: services/data-fetchers/YourWorker/Dockerfile
    tags: yourworker:latest
    cache-from: type=gha,scope=yourworker
    cache-to: type=gha,mode=max,scope=yourworker
    outputs: type=docker,dest=/tmp/yourworker.tar
```

## 4. Add Compression
```bash
if [ -f /tmp/yourworker.tar ]; then
  gzip -1 < /tmp/yourworker.tar > /tmp/images/yourworker.tar.gz
fi
```

## 5. Add to Image Loading
```bash
for NAME in twelvedata metrics yourworker; do
  [ -f "/tmp/${NAME}.tar.gz" ] && gunzip -c "/tmp/${NAME}.tar.gz" | docker load
done
```

## Related
- [CI/CD Deployment Rules](../../../../rules/cicd-deployment.md)
