#!/bin/bash

genInfoText() {
    echo "TIMESTAMP : $1"
    echo "SEMVER    : $2"
}

setup() {
    local VERSION=$1
    local API_NAMES=("$@")
    API_NAMES=("${API_NAMES[@]:1}")
    if [ -z "$VERSION" ]; then
        echo "Usage: $0 <version>" >&2
        exit 1
    fi
    echo "Building project structure for openv $VERSION with apis: ${API_NAMES[*]}"

    npm i
    npm run build
    mkdir -p cdn/release/$VERSION-$TS
    ln -sfn "$VERSION-$TS" cdn/release/$VERSION
    ln -sfn "$VERSION-$TS" cdn/release/latest

    for API_NAME in "${API_NAMES[@]}"; do
        if [ ! -f "dist/$API_NAME.bundle.js" ]; then
            echo "Error: API bundle dist/$API_NAME.bundle.js does not exist." >&2
            exit 1
        fi
        local API_PATH=${API_NAME//./\/}
        mkdir -p "cdn/repo/$API_PATH/$VERSION-$TS"
        ln -sfn "$VERSION-$TS" "cdn/repo/$API_PATH/$VERSION"
        ln -sfn "$VERSION" "cdn/repo/$API_PATH/latest"
    done
}

copyFiles() {
    local VERSION=$1
    local API_NAMES=("$@")
    API_NAMES=("${API_NAMES[@]:1}")

    echo "Copying files to cdn/$VERSION-$TS"
    cp -r dist/* "cdn/release/$VERSION-$TS"
    rm "cdn/release/$VERSION-$TS/"*.tsbuildinfo
    echo "$INFO" > "cdn/release/$VERSION-$TS/info.txt"

    for API_NAME in "${API_NAMES[@]}"; do
        local API_PATH=${API_NAME//./\/}
        echo "Copying $API_NAME to cdn/repo/$API_PATH/$VERSION-$TS/bundle.js"
        cp dist/$API_NAME.bundle.js "cdn/repo/$API_PATH/$VERSION-$TS/bundle.js"
        echo "$INFO" > "cdn/repo/$API_PATH/$VERSION-$TS/info.txt"
    done
}

main() {
    if [ "$#" -lt 1 ]; then
        echo "Usage: $0 <version> [api1 api2 ...]" >&2
        exit 1
    fi

    local VERSION=$1
    shift
    local API_NAMES=("$@")

    TS=$(date +%s)
    INFO="$(genInfoText "$TS" "$VERSION")"

    setup "$VERSION" "${API_NAMES[@]}"
    copyFiles "$VERSION" "${API_NAMES[@]}"
    echo "Done."
}

main "$@"