#!/bin/bash
# Run in AWS CloudShell (signed in as the account owner or an admin).
# Creates IAM user "veil-orchestrator" with the spec 12.1 policy and one access key,
# and saves the key to ~/veil-keys.json. It launches nothing and costs nothing.
set -euo pipefail
U=veil-orchestrator

if aws iam get-user --user-name "$U" >/dev/null 2>&1; then
  echo "User $U already exists"
else
  aws iam create-user --user-name "$U" --tags Key=veil-managed,Value=true >/dev/null
  echo "Created user $U"
fi

cat > /tmp/veil-orchestrator-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "VeilDescribeAndLaunch",
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeRegions",
        "ec2:DescribeImages",
        "ec2:DescribeInstanceTypes",
        "ec2:DescribeInstances",
        "ec2:DescribeVpcs",
        "ec2:DescribeSecurityGroups",
        "ec2:CreateDefaultVpc",
        "ec2:CreateSecurityGroup",
        "ec2:AuthorizeSecurityGroupIngress",
        "ec2:CreateTags",
        "ec2:RunInstances"
      ],
      "Resource": "*"
    },
    {
      "Sid": "VeilManageOwnInstances",
      "Effect": "Allow",
      "Action": ["ec2:RebootInstances", "ec2:TerminateInstances"],
      "Resource": "*",
      "Condition": { "StringEquals": { "aws:ResourceTag/veil-managed": "true" } }
    }
  ]
}
EOF
aws iam put-user-policy --user-name "$U" --policy-name veil-orchestrator \
  --policy-document file:///tmp/veil-orchestrator-policy.json
echo "Policy veil-orchestrator attached"

# AWS allows two keys per user.
n=$(aws iam list-access-keys --user-name "$U" --query 'length(AccessKeyMetadata)' --output text)
if [ "$n" -ge 2 ]; then
  echo "STOP: $U already has 2 access keys. Delete an old one in IAM > Users > $U > Security credentials, then run this again."
  exit 1
fi

aws iam create-access-key --user-name "$U" \
  --query 'AccessKey.{accessKeyId:AccessKeyId,secretAccessKey:SecretAccessKey}' \
  --output json > ~/veil-keys.json
chmod 600 ~/veil-keys.json
echo
echo "DONE. Keys saved to /home/cloudshell-user/veil-keys.json"
echo "Now: Actions (top right) > Download file > type: veil-keys.json > Download"
echo "Do not paste the keys anywhere."
