#!/bin/bash
set -u
IFACE=$(ip -4 route show default | awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}')

if [ "$1" = "up" ]; then
  iptables -N VEIL_FWD 2>/dev/null || true
  iptables -F VEIL_FWD
  iptables -A VEIL_FWD -d 169.254.0.0/16 -j DROP
  iptables -A VEIL_FWD -d 10.0.0.0/8 -j DROP
  iptables -A VEIL_FWD -d 172.16.0.0/12 -j DROP
  iptables -A VEIL_FWD -d 192.168.0.0/16 -j DROP
  iptables -A VEIL_FWD -d 100.64.0.0/10 -j DROP
  iptables -A VEIL_FWD -p tcp --dport 25 -j DROP
  iptables -A VEIL_FWD -o "$IFACE" -j ACCEPT
  iptables -A VEIL_FWD -j DROP
  iptables -C FORWARD -i wg0 -j VEIL_FWD 2>/dev/null || iptables -I FORWARD 1 -i wg0 -j VEIL_FWD
  iptables -C FORWARD -o wg0 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT 2>/dev/null || iptables -I FORWARD 2 -o wg0 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
  iptables -C FORWARD -o wg0 -j DROP 2>/dev/null || iptables -I FORWARD 3 -o wg0 -j DROP
  iptables -C INPUT -i wg0 -j DROP 2>/dev/null || iptables -I INPUT 1 -i wg0 -j DROP
  iptables -t nat -C POSTROUTING -s 10.66.0.0/16 -o "$IFACE" -j MASQUERADE 2>/dev/null || iptables -t nat -A POSTROUTING -s 10.66.0.0/16 -o "$IFACE" -j MASQUERADE
  iptables -t mangle -C FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu 2>/dev/null || iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu
else
  iptables -D FORWARD -i wg0 -j VEIL_FWD 2>/dev/null || true
  iptables -D FORWARD -o wg0 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT 2>/dev/null || true
  iptables -D FORWARD -o wg0 -j DROP 2>/dev/null || true
  iptables -D INPUT -i wg0 -j DROP 2>/dev/null || true
  iptables -t nat -D POSTROUTING -s 10.66.0.0/16 -o "$IFACE" -j MASQUERADE 2>/dev/null || true
  iptables -t mangle -D FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu 2>/dev/null || true
  iptables -F VEIL_FWD 2>/dev/null || true
  iptables -X VEIL_FWD 2>/dev/null || true
fi
exit 0
