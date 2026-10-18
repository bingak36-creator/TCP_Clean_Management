#pragma once
// Copy to device_config.h (ignored by Git). Paste the CA for your HTTPS server.
// The device key is provisioned through WiFiManager and stored in NVS, never in Git.
#define TCP_SERVER_ROOT_CA ""
// Only for SUPABASE mode: root CA PEM of your Supabase project host. Empty disables Supabase sending.
#define TCP_SUPABASE_ROOT_CA ""
// Development only: permits plain HTTP to literal RFC1918 private IPv4 addresses.
#define TCP_ALLOW_LAN_HTTP false
