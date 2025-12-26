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
  --availability-domain "ZtqO:AP-SINGAPORE-1-AD-1" `
  --compartment-id "ocid1.tenancy.oc1..aaaaaaaabmhnjpjmirrqwoecj64wsimmlksoramzhp36i3iyr2sysob4ueeq" `
  --shape "VM.Standard.A1.Flex" `
  --shape-config file://$env:TEMP/shape-config.json `
  --image-id "ocid1.image.oc1.ap-singapore-1.aaaaaaaamhhpqoyiobauojy3m2huj6tusesizrggbpek2wo4tksiwwv43ihq" `
  --subnet-id "ocid1.subnet.oc1.ap-singapore-1.aaaaaaaaxu4zjelejutodjy2h56zkjt3xkoq46amnz4josoevlr53te2mw6a" `
  --assign-public-ip true `
  --display-name "stocktracker-worker" `
  --metadata file://$env:TEMP/metadata.json
```

### AMD Instance (1/8 OCPU, 1GB - Always Available)

```powershell
oci compute instance launch `
  --availability-domain "ZtqO:AP-SINGAPORE-1-AD-1" `
  --compartment-id "ocid1.tenancy.oc1..aaaaaaaabmhnjpjmirrqwoecj64wsimmlksoramzhp36i3iyr2sysob4ueeq" `
  --shape "VM.Standard.E2.1.Micro" `
  --image-id "ocid1.image.oc1.ap-singapore-1.aaaaaaaaaor2ppotfqkory4rhl25opnzpgqjhgzeovebmegnkedm6fhbl7ka" `
  --subnet-id "ocid1.subnet.oc1.ap-singapore-1.aaaaaaaaxu4zjelejutodjy2h56zkjt3xkoq46amnz4josoevlr53te2mw6a" `
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

| Resource | OCID |
|----------|------|
| Tenancy | `ocid1.tenancy.oc1..aaaaaaaabmhnjpjmirrqwoecj64wsimmlksoramzhp36i3iyr2sysob4ueeq` |
| User | `ocid1.user.oc1..aaaaaaaapjlo6oepcu4ssgo2tbctgmlzwpn6r2rdtoisjp7zbrie5fffxa2q` |
| VCN | `ocid1.vcn.oc1.ap-singapore-1.amaaaaaaon7blmaaqcfngttgglgutct7upw3dhnao644nvtfabl2t6qmqjkq` |
| Subnet | `ocid1.subnet.oc1.ap-singapore-1.aaaaaaaaxu4zjelejutodjy2h56zkjt3xkoq46amnz4josoevlr53te2mw6a` |
| Ubuntu ARM Image | `ocid1.image.oc1.ap-singapore-1.aaaaaaaamhhpqoyiobauojy3m2huj6tusesizrggbpek2wo4tksiwwv43ihq` |
| Ubuntu AMD Image | `ocid1.image.oc1.ap-singapore-1.aaaaaaaaaor2ppotfqkory4rhl25opnzpgqjhgzeovebmegnkedm6fhbl7ka` |





