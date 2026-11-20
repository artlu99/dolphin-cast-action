#!/usr/bin/env python3
"""Deploy public/ to Quilibrium QStorage.

Run with the keys decrypted into the environment:

    uvx dotenvx run -- uv run python deploy.py

Uploads use boto3. Each object is uploaded, then made public-read in a
separate call. Content types are checked again after the upload.
"""

import json
import os
import sys
import time

import boto3
from botocore.config import Config

ENDPOINT_URL = "https://qstorage.quilibrium.com"
SITE_DIR = "public"
INDEX_DOCUMENT = "index.html"
ORIGIN_HOST = "qstorage.quilibrium.com"

CONTENT_TYPES = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".json": "application/json",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
}


def bucket_name():
    name = os.environ.get("QSTORAGE_BUCKET", "dolphin")
    if not name or "." in name or not all(c.islower() or c.isdigit() or c == "-" for c in name):
        sys.exit("QSTORAGE_BUCKET must be lowercase letters, numbers, and hyphens, with no dots.")
    if name.startswith("-") or name.endswith("-") or len(name) < 3:
        sys.exit("QSTORAGE_BUCKET must be at least 3 characters and not start or end with a hyphen.")
    return name


def require_env():
    missing = [key for key in ("QSTORAGE_ACCESS_KEY_ID", "QSTORAGE_SECRET_ACCESS_KEY") if not os.environ.get(key)]
    if missing:
        sys.exit(
            "Missing " + ", ".join(missing) + ".\n"
            "Put them in .env, encrypt with `uvx dotenvx encrypt`, then run:\n"
            "  uvx dotenvx run -- uv run python deploy.py"
        )


def origin(bucket):
    return f"https://{bucket}.{ORIGIN_HOST}/"


def check_manifest(bucket):
    path = os.path.join(SITE_DIR, ".well-known", "farcaster.json")
    with open(path, encoding="utf-8") as handle:
        manifest = json.load(handle)["miniapp"]
    expected = origin(bucket)
    for field in ("homeUrl", "castShareUrl"):
        if manifest.get(field) != expected:
            sys.exit(f"{field} is {manifest.get(field)!r}, expected {expected!r}.")
    html = open(os.path.join(SITE_DIR, "index.html"), encoding="utf-8").read()
    if expected not in html:
        sys.exit(f"index.html does not mention {expected}.")


def create_client():
    # Recent boto3 adds CRC checksums that QStorage rejects as AccessDenied.
    return boto3.client(
        "s3",
        endpoint_url=ENDPOINT_URL,
        aws_access_key_id=os.environ["QSTORAGE_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["QSTORAGE_SECRET_ACCESS_KEY"],
        config=Config(
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
        ),
    )


def create_bucket(s3, bucket):
    try:
        s3.create_bucket(Bucket=bucket)
        print(f"Bucket created: {bucket}")
    except s3.exceptions.BucketAlreadyOwnedByYou:
        print(f"Bucket already exists: {bucket}")
    except Exception as error:
        code = getattr(error, "response", {}).get("Error", {}).get("Code", "")
        # QStorage reports our own bucket as BucketAlreadyExists.
        if code in ("BucketAlreadyOwnedByYou", "BucketAlreadyExists"):
            print(f"Bucket already exists: {bucket}")
            return
        raise


def files():
    found = []
    for root, _dirs, names in os.walk(SITE_DIR):
        for name in names:
            path = os.path.join(root, name)
            key = os.path.relpath(path, SITE_DIR).replace(os.sep, "/")
            found.append((path, key))
    return found


def intended_content_type(key):
    ext = os.path.splitext(key)[1].lower()
    return CONTENT_TYPES.get(ext, "application/octet-stream")


def upload_files(s3, bucket):
    for path, key in files():
        content_type = intended_content_type(key)
        s3.upload_file(path, bucket, key, ExtraArgs={"ContentType": content_type})
        s3.put_object_acl(Bucket=bucket, Key=key, ACL="public-read")
        print(f"  {key} ({content_type})")


def head_with_retry(s3, bucket, key, attempts=3):
    for attempt in range(attempts):
        try:
            return s3.head_object(Bucket=bucket, Key=key)
        except s3.exceptions.ClientError as error:
            code = error.response.get("Error", {}).get("Code", "")
            if code in ("403", "Forbidden") and attempt < attempts - 1:
                time.sleep(3)
                continue
            raise


def audit_content_types(s3, bucket):
    fixed = 0
    for path, key in files():
        expected = intended_content_type(key)
        actual = head_with_retry(s3, bucket, key).get("ContentType", "")
        if actual == expected:
            continue
        print(f"  {key}: served as {actual!r}, expected {expected!r}. Uploading again.")
        s3.upload_file(path, bucket, key, ExtraArgs={"ContentType": expected})
        s3.put_object_acl(Bucket=bucket, Key=key, ACL="public-read")
        fixed += 1
    print(f"Content-type audit complete ({fixed} fixed)")


def enable_website_hosting(s3, bucket):
    # No error document. A missing key should stay a 404, not the home page.
    s3.put_bucket_website(
        Bucket=bucket,
        WebsiteConfiguration={"IndexDocument": {"Suffix": INDEX_DOCUMENT}},
    )
    print("Static website hosting enabled")


def set_bucket_policy(s3, bucket):
    policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "PublicReadGetObject",
                "Effect": "Allow",
                "Principal": "*",
                "Action": "s3:GetObject",
                "Resource": f"arn:aws:s3:::{bucket}/*",
            }
        ],
    }
    s3.put_bucket_policy(Bucket=bucket, Policy=json.dumps(policy))
    print("Public-read bucket policy applied")


def main():
    require_env()
    bucket = bucket_name()
    check_manifest(bucket)
    s3 = create_client()
    create_bucket(s3, bucket)
    print("Uploading files...")
    upload_files(s3, bucket)
    audit_content_types(s3, bucket)
    enable_website_hosting(s3, bucket)
    set_bucket_policy(s3, bucket)
    print()
    print(f"Site URL: {origin(bucket)}")
    print(f"Add it: https://quilcast.com/actions?add={bucket}.{ORIGIN_HOST}")


if __name__ == "__main__":
    main()
