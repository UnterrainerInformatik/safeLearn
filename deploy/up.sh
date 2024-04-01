#!/usr/bin/env bash
docker-compose pull
docker-compose up -d --force-recreate --remove-orphans &