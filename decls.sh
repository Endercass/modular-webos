#!/bin/bash

PROJECTS=$(find . -name 'tsconfig.json' -printf '%h\n' | sort -u)

for PROJECT in $PROJECTS; do
    API_NAME=$(basename "$PROJECT")
    echo "Declaring project $API_NAME in $PROJECT"
    npx tsc --build "$PROJECT/tsconfig.json"
done
