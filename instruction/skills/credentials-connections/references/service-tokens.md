# Service Tokens & API Keys

Guide to configuring service account tokens, API keys, and cloud CLI credentials.

---

## Grafana Service Account Token

### Configuration

**Config file locations**:
- Windows: `%LOCALAPPDATA%\grafanactl\config.yaml`
- Linux: `~/.config/grafanactl/config.yaml`

**Config format**:
```yaml
contexts:
  stocktracker:
    grafana:
      server: https://stockandcryptotracker.grafana.net
      token: <GRAFANA_SERVICE_ACCOUNT_TOKEN>
current-context: stocktracker
```

### Creating a Service Account Token (CRITICAL)

1. Go to: https://stockandcryptotracker.grafana.net/org/serviceaccounts
2. Click "Add service account"
3. Enter name: `grafanactl-cli`
4. Select role: **Admin**
5. Click "Create"
6. Click "Add service account token"
7. Token will start with `glsa_...`
8. **Copy token immediately** (cannot be viewed again)
9. Store in Infisical as `GRAFANA_SERVICE_ACCOUNT_TOKEN`

### Token Type Matters (CRITICAL GOTCHA)

- ✅ **CORRECT**: `glsa_...` (service account token)
- ❌ **WRONG**: `glc_...` (cloud access policy token)

**Why it matters**:
- Cloud access policy tokens (`glc_*`) will return **401 Unauthorized** with grafanactl
- Only service account tokens (`glsa_*`) work with grafanactl

**How to identify**:
```bash
# Good token (service account)
glsa_abcd1234efgh5678ijkl9012mnop3456

# Bad token (cloud policy) - will fail
glc_abcd1234efgh5678ijkl9012mnop3456
```

### Verify Configuration

```bash
# Check config
grafanactl config check

# View config
grafanactl config view

# List contexts
grafanactl config list-contexts

# Test connection
grafanactl resources list
```

---

## Oracle Cloud OCI CLI

### Resource IDs (Singapore Region)

| Resource | OCID |
|----------|------|
| **Tenancy** | `ocid1.tenancy.oc1..aaaaaaaabmhnjpjmirrqwoecj64wsimmlksoramzhp36i3iyr2sysob4ueeq` |
| **VCN** | `ocid1.vcn.oc1.ap-singapore-1.amaaaaaaon7blmaaqcfngttgglgutct7upw3dhnao644nvtfabl2t6qmqjkq` |
| **Subnet** | `ocid1.subnet.oc1.ap-singapore-1.aaaaaaaaxu4zjelejutodjy2h56zkjt3xkoq46amnz4josoevlr53te2mw6a` |
| **Compartment** | `ocid1.tenancy.oc1..aaaaaaaabmhnjpjmirrqwoecj64wsimmlksoramzhp36i3iyr2sysob4ueeq` |
| **Availability Domain** | `ZtqO:AP-SINGAPORE-1-AD-1` |
| **Region** | `ap-singapore-1` |

### Instance Templates

**ARM Instance (Free Tier - 4 OCPU, 24GB)**:
- Shape: `VM.Standard.A1.Flex`
- Image ID: `ocid1.image.oc1.ap-singapore-1.aaaaaaaamhhpqoyiobauojy3m2huj6tusesizrggbpek2wo4tksiwwv43ihq`

**AMD Instance (Always Available - 1/8 OCPU, 1GB)**:
- Shape: `VM.Standard.E2.1.Micro`
- Image ID: `ocid1.image.oc1.ap-singapore-1.aaaaaaaaaor2ppotfqkory4rhl25opnzpgqjhgzeovebmegnkedm6fhbl7ka`

### Setup OCI CLI (Windows)

```powershell
# Add OCI CLI to PATH
$env:PATH += ";C:\Users\Nixon\AppData\Roaming\Python\Python312\Scripts"

# Test authentication
oci iam region list --output table
```

### Configuration File

**Location**: `~/.oci/config` (all platforms)

```ini
[DEFAULT]
user=ocid1.user.oc1..your-user-ocid
fingerprint=your-key-fingerprint
tenancy=ocid1.tenancy.oc1..aaaaaaaabmhnjpjmirrqwoecj64wsimmlksoramzhp36i3iyr2sysob4ueeq
region=ap-singapore-1
key_file=~/.oci/oci_api_key.pem
```

---

## AI Hub API Key

### Purpose
Used by:
- n8n workflows
- TwelveData worker
- Metrics service
- Back-office UI

### Storage
- **Infisical**: `AI_HUB_API_KEY`
- **Docker Compose**: Injected as environment variable

### Usage in Code

```csharp
// .NET services
var apiKey = Environment.GetEnvironmentVariable("AI_HUB_API_KEY");
```

```typescript
// Next.js (Back-office)
const apiKey = process.env.AI_HUB_API_KEY;
```

### Generating New Key

AI Hub API keys are managed by the AI Hub 2.0 service itself. Contact the service admin to generate new keys.

---

## Supabase API Keys

### Public Keys (Frontend)

Stored with `NEXT_PUBLIC_` prefix (safe to expose to browser):

| Variable | Used By | Stored In |
|----------|---------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Frontend | Infisical → Vercel |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Frontend | Infisical → Vercel |

**Auto-syncs to Vercel** via Infisical integration.

### Private Keys (Backend)

| Variable | Used By | Stored In |
|----------|---------|-----------|
| `DATABASE_CONNECTION_STRING` | Workers | Infisical → VM |

**Format**:
```
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

---

## GitHub Personal Access Token

### Purpose
- VM git clone of private repository
- GitHub Actions authentication (if needed)

### Storage
- **Infisical**: `PAT_GITHUB`
- **GitHub Secrets**: Synced from Infisical

### Permissions Required
- `repo` (full control of private repositories)

### Creating New Token

1. Go to: https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes: `repo`
4. Click "Generate token"
5. Store in Infisical as `PAT_GITHUB`

---

## Troubleshooting

### Grafana: 401 Unauthorized

**Cause**: Using cloud policy token (`glc_*`) instead of service account token (`glsa_*`).

**Solution**:
1. Go to https://stockandcryptotracker.grafana.net/org/serviceaccounts
2. Create new service account token (starts with `glsa_`)
3. Update config file with new token

### OCI: Invalid Signature

**Cause**: API key fingerprint mismatch.

**Solution**:
```powershell
# Check fingerprint
openssl rsa -pubout -outform DER -in ~/.oci/oci_api_key.pem | openssl md5 -c

# Compare with config file fingerprint
cat ~/.oci/config
```

### Supabase: Connection Failed

**Cause**: Wrong connection string or database not accessible.

**Solution**:
1. Check connection string in Infisical
2. Ensure using **pooler** port `6543`, not direct port `5432`
3. Verify Supabase project is not paused

---

## Related

- [Infisical Secrets](infisical-secrets.md) - Secret management workflow
- [Infrastructure Configuration](../../../reference/infrastructure-config.md) - Service configuration
