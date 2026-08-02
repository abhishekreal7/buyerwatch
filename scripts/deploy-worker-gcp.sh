#!/usr/bin/env bash
set -e

PROJECT_ID="scouto-501307"
REGION="us-central1"
SERVICE_NAME="buyerwatch-worker"
MIN_INSTANCES="${MIN_INSTANCES:-1}"
MAX_INSTANCES="${MAX_INSTANCES:-2}"

if (( MAX_INSTANCES < MIN_INSTANCES )); then
  echo "MAX_INSTANCES must be greater than or equal to MIN_INSTANCES." >&2
  exit 1
fi

echo "🚀 Deploying BuyerWatch Background Worker to GCP ($PROJECT_ID / $REGION)..."

if [[ "$(gcloud billing projects describe "$PROJECT_ID" --format 'value(billingEnabled)' 2>/dev/null)" != "True" ]]; then
  echo "Google Cloud billing is not enabled for $PROJECT_ID. Link an active billing account before deploying." >&2
  exit 1
fi

# 1. Enable GCP Services
gcloud services enable run.googleapis.com containerregistry.googleapis.com artifactregistry.googleapis.com --project "$PROJECT_ID"

# 2. Build & Submit Container
IMAGE_URI="gcr.io/$PROJECT_ID/$SERVICE_NAME:latest"
echo "2. Building & Pushing Docker Container to $IMAGE_URI..."
gcloud builds submit --tag "$IMAGE_URI" --project "$PROJECT_ID"

# 3. Deploy with CPU available for background work between HTTP requests.
echo "3. Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE_URI" \
  --platform managed \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --min-instances "$MIN_INSTANCES" \
  --max-instances "$MAX_INSTANCES" \
  --no-cpu-throttling \
  --cpu 1 \
  --memory 1Gi \
  --port 3001 \
  --startup-probe "httpGet.path=/healthz,httpGet.port=3001,initialDelaySeconds=0,timeoutSeconds=5,periodSeconds=5,failureThreshold=12" \
  --readiness-probe "httpGet.path=/readyz,httpGet.port=3001,initialDelaySeconds=5,timeoutSeconds=5,periodSeconds=10,failureThreshold=3" \
  --liveness-probe "httpGet.path=/healthz,httpGet.port=3001,initialDelaySeconds=30,timeoutSeconds=5,periodSeconds=30,failureThreshold=3" \
  --allow-unauthenticated \
  --update-env-vars "NODE_ENV=production,GCP_PROJECT=$PROJECT_ID,GCP_LOCATION=$REGION"

SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --format 'value(status.url)')"

if [[ -z "$SERVICE_URL" ]]; then
  echo "Cloud Run did not return a service URL." >&2
  exit 1
fi

echo "4. Verifying worker readiness at $SERVICE_URL/readyz..."
READY=false
for _ in {1..12}; do
  if curl --fail --silent --show-error --max-time 10 "$SERVICE_URL/readyz" >/dev/null; then
    READY=true
    break
  fi
  sleep 5
done

if [[ "$READY" != true ]]; then
  echo "Worker deployed but never became ready. Inspect the latest Cloud Run revision logs." >&2
  exit 1
fi

echo "Deployment complete. The always-allocated worker passed its readiness check."
