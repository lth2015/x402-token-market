# Shared K8s Resources

```
_shared/
├─ namespaces.yaml         all namespaces + default deny-all NetworkPolicy
├─ external-secrets.yaml   ClusterSecretStore wired to AWS Secrets Manager (via IRSA)
└─ README.md               (this file)
```

## Apply order (first-time bootstrap)

```bash
# 0. Pre-req on AWS: EKS cluster, OIDC provider, IAM roles for
#    `external-secrets`, `aws-load-balancer-controller`. See infra/ARCHITECTURE.md.

# 1. Install helm charts (cluster addons)
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets -n external-secrets --create-namespace

helm repo add eks https://aws.github.io/eks-charts
helm install aws-load-balancer-controller eks/aws-load-balancer-controller -n kube-system \
  --set clusterName=netstars-qa

# 2. Apply our shared resources
kubectl apply -f infra/k8s/_shared/

# 3. Apply per-module
kubectl apply -f infra/k8s/x402/
kubectl apply -f infra/k8s/token/
# (wea is applied to its own cluster; manifests in infra/k8s/wea/ are template only)

# 4. Verify
kubectl get pods -A
kubectl get ingress -A
```

## NetworkPolicy strategy
Every namespace starts with **deny-all**. Each module's `networkpolicy.yaml` opens
the minimum required paths:
- ingress: from `ingress` ns (ALB target group) + intra-module
- egress: to RDS (DB subnets), Redis, AWS APIs (via VPC Endpoint),
  and only the specific external endpoints needed (e.g. Anthropic API for token-api).
