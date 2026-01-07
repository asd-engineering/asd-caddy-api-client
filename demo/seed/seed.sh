#!/bin/sh
# Seed Elasticsearch with sample product data

ES_URL="${ES_URL:-http://elasticsearch:9200}"
INDEX_NAME="products"

echo "Waiting for Elasticsearch to be ready..."
until curl -sf "${ES_URL}/_cluster/health" > /dev/null 2>&1; do
  echo "  Elasticsearch not ready, waiting..."
  sleep 2
done
echo "Elasticsearch is ready!"

# Check if index already exists
if curl -sf "${ES_URL}/${INDEX_NAME}" > /dev/null 2>&1; then
  echo "Index '${INDEX_NAME}' already exists, skipping seed"
  exit 0
fi

echo "Creating index '${INDEX_NAME}'..."

# Create index with mapping
curl -sf -X PUT "${ES_URL}/${INDEX_NAME}" \
  -H "Content-Type: application/json" \
  -d '{
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "analysis": {
        "analyzer": {
          "product_analyzer": {
            "type": "custom",
            "tokenizer": "standard",
            "filter": ["lowercase", "asciifolding"]
          }
        }
      }
    },
    "mappings": {
      "properties": {
        "name": {
          "type": "text",
          "analyzer": "product_analyzer"
        },
        "category": {
          "type": "keyword"
        },
        "description": {
          "type": "text",
          "analyzer": "product_analyzer"
        },
        "price": {
          "type": "float"
        }
      }
    }
  }'

echo ""
echo "Loading sample products..."

# Read products and bulk index
# Build bulk request body
BULK_BODY=""
ID=1

# Read JSON and create bulk index request
while IFS= read -r line; do
  # Skip empty lines and array brackets
  case "$line" in
    "["*|"]"*|"") continue ;;
  esac

  # Remove trailing comma if present
  line=$(echo "$line" | sed 's/,$//')

  # Add bulk index action and document
  BULK_BODY="${BULK_BODY}{\"index\":{\"_index\":\"${INDEX_NAME}\",\"_id\":\"${ID}\"}}\n${line}\n"
  ID=$((ID + 1))
done < /data/products.json

# Send bulk request
echo -e "$BULK_BODY" | curl -sf -X POST "${ES_URL}/_bulk" \
  -H "Content-Type: application/x-ndjson" \
  --data-binary @-

echo ""
echo "Refreshing index..."
curl -sf -X POST "${ES_URL}/${INDEX_NAME}/_refresh"

echo ""
echo "Verifying data..."
COUNT=$(curl -sf "${ES_URL}/${INDEX_NAME}/_count" | grep -o '"count":[0-9]*' | cut -d: -f2)
echo "Indexed ${COUNT} products successfully!"

echo ""
echo "Sample search test:"
curl -sf "${ES_URL}/${INDEX_NAME}/_search?q=keyboard&size=2" | head -c 500
echo ""
echo ""
echo "Seed completed!"
