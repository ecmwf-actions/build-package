#!/bin/bash

[[ ! -d .git/hooks ]] && exit 0

echo "> Installing git hooks..."
cp scripts/hooks/* .git/hooks/
echo "> Done. 🎉"
