#!/bin/sh
sleep 20
/usr/bin/mc config host add myminio http://minio:9000 ${MINIO_ROOT_USER} ${MINIO_ROOT_PASSWORD};
/usr/bin/mc mb myminio/${MINIO_BUCKET};
/usr/bin/mc anonymous set download myminio/${MINIO_BUCKET};
/usr/bin/mc ilm import myminio/$MINIO_BUCKET < lifecycle.json;
exit 0;
