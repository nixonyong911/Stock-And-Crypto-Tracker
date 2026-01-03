# CI/CD Pipeline Reference

File: `.github/workflows/deploy-vm.yml`

## Steps

1. **Trigger path:** `services/workers/{type}/YourWorker/**`
2. **Change detection:** Add `yourworker` filter
3. **Build step:** `docker/build-push-action@v5` with cache
4. **Compression:** `gzip -1 < /tmp/yourworker.tar > /tmp/images/yourworker.tar.gz`
5. **Image loading:** Add to load loop

## Build Step Template

```yaml
- name: Build YourWorker
  if: needs.detect-changes.outputs.yourworker == 'true'
  uses: docker/build-push-action@v5
  with:
    context: services/
    file: services/workers/{type}/YourWorker/Dockerfile
    tags: yourworker:latest
    outputs: type=docker,dest=/tmp/yourworker.tar
```

## Related
- [CI/CD Rules](../../../../rules/cicd-deployment.md)
