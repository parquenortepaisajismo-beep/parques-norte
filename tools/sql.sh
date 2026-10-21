#!/usr/bin/env bash
# Corre un .sql en el proyecto Supabase de Parques Norte. Uso: tools/sql.sh archivo.sql
cd "$(dirname "$0")/.." || exit 1
REF=pwemsreanpeiieegtyca
TMP=$(mktemp --suffix=.json)
powershell -NoProfile -ExecutionPolicy Bypass -File tools/sqlbody.ps1 "$1" "$(cygpath -w "$TMP")"
curl -s -w "\nHTTP %{http_code}\n" -X POST -H "Authorization: Bearer $(cat supabase-token.txt)" -H "Content-Type: application/json; charset=utf-8" \
  "https://api.supabase.com/v1/projects/$REF/database/query" --data-binary @"$TMP"
rm -f "$TMP"
