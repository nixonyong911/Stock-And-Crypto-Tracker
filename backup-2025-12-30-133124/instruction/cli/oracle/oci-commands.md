# Oracle Cloud CLI Commands

## Setup

```powershell
# Add OCI CLI to PATH
$env:PATH += ";C:\Users\Nixon\AppData\Roaming\Python\Python312\Scripts"

# Test authentication
oci iam region list --output table
```

## Instance Creation

### ARM Instance (4 OCPU, 24GB - Best Free Tier)

```powershell
# Create shape config
'{"ocpus": 4, "memoryInGBs": 24}' | Out-File -FilePath "$env:TEMP\shape-config.json" -Encoding ascii -NoNewline

# Create metadata with SSH key
$sshKey = Get-Content "$env:USERPROFILE\.ssh\id_rsa.pub"
'{"ssh_authorized_keys": "' + $sshKey + '"}' | Out-File -FilePath "$env:TEMP\metadata.json" -Encoding ascii -NoNewline

# Launch instance
oci compute instance launch `
  --availability-domain "$env:OCI_AVAILABILITY_DOMAIN" `
  --compartment-id "$env:OCI_COMPARTMENT_OCID" `
  --shape "VM.Standard.A1.Flex" `
  --shape-config file://$env:TEMP/shape-config.json `
  --image-id "$env:OCI_IMAGE_OCID_ARM" `
  --subnet-id "$env:OCI_SUBNET_OCID" `
  --assign-public-ip true `
  --display-name "stocktracker-worker" `
  --metadata file://$env:TEMP/metadata.json
```

### AMD Instance (1/8 OCPU, 1GB - Always Available)

```powershell
oci compute instance launch `
  --availability-domain "$env:OCI_AVAILABILITY_DOMAIN" `
  --compartment-id "$env:OCI_COMPARTMENT_OCID" `
  --shape "VM.Standard.E2.1.Micro" `
  --image-id "$env:OCI_IMAGE_OCID_AMD" `
  --subnet-id "$env:OCI_SUBNET_OCID" `
  --assign-public-ip true `
  --display-name "stocktracker-worker" `
  --metadata file://$env:TEMP/metadata.json
```

## Instance Management

```powershell
# List instances
oci compute instance list --compartment-id <COMPARTMENT_ID> --output table

# Get public IP
oci compute instance list-vnics --instance-id <INSTANCE_OCID> --query 'data[0]."public-ip"'

# Terminate instance
oci compute instance terminate --instance-id <INSTANCE_OCID> --force
```

## Useful Queries

```powershell
# List images
oci compute image list --compartment-id <COMPARTMENT_ID> --operating-system "Canonical Ubuntu" --all

# Check availability domains
oci iam availability-domain list --output table
```

---

## Oracle Resource IDs (Singapore Region)

Values stored in Infisical (`infisical secrets --env=prod --plain | grep OCI_`).

| Resource | Infisical Key |
|----------|---------------|
| Tenancy | `OCI_TENANCY_OCID` |
| User | `OCI_USER_OCID` (not in repo; store in Infisical) |
| VCN | `OCI_VCN_OCID` |
| Subnet | `OCI_SUBNET_OCID` |
| Ubuntu ARM Image | `OCI_IMAGE_OCID_ARM` |
| Ubuntu AMD Image | `OCI_IMAGE_OCID_AMD` |










