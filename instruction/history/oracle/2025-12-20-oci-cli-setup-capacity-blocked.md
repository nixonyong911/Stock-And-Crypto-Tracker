# OCI CLI Setup - Instance Blocked by Capacity

**Context**: Setting up Oracle Cloud Free Tier for .NET worker deployment.

## Issue
- OCI CLI installation and authentication completed successfully
- ARM instance (4 OCPU, 24GB) creation failed: Singapore region out of capacity
- AMD instance (E2.1.Micro) also unavailable

## Solution
- OCI CLI configured at `~/.oci/config` with API key authentication
- VCN/Subnet already provisioned in `ap-singapore-1`
- Retry options documented: auto-retry script, alternative regions, smaller OCPUs

## Key Commands

```powershell
# Test CLI auth
oci iam region list --output table

# Launch ARM instance (when capacity available)
oci compute instance launch --shape "VM.Standard.A1.Flex" --shape-config file://$env:TEMP/shape-config.json ...

# Launch AMD instance (fallback)
oci compute instance launch --shape "VM.Standard.E2.1.Micro" ...
```

**Outcome**: OCI CLI ready. Instance creation pending capacity. See `cli/oracle/oci-commands.md` for full commands.









