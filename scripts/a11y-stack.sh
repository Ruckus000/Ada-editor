#!/bin/bash
# Brings up the Linux assistive-technology stack: virtual display, session bus,
# AT-SPI accessibility bus and registry. Blocks so the harness keeps it alive.
set -u
pkill -f 'Xvfb :99' 2>/dev/null
pkill -f at-spi2 2>/dev/null
pkill -f 'dbus-daemon --config-file' 2>/dev/null
sleep 1

Xvfb :99 -screen 0 1600x1000x24 >/tmp/xvfb.log 2>&1 &
sleep 2
export DISPLAY=:99

# A window manager. Without one there is no _NET_ACTIVE_WINDOW, so
# `xdotool windowactivate` fails outright and there is no active-window concept
# for a screen reader to follow. On a CI runner Orca announced the browser frame
# title and then went silent; this is the most likely reason.
if command -v openbox >/dev/null 2>&1; then
  openbox >/tmp/openbox.log 2>&1 &
  sleep 2
fi

eval "$(dbus-launch --sh-syntax)"
echo "DBUS_SESSION_BUS_ADDRESS='$DBUS_SESSION_BUS_ADDRESS'" > /tmp/a11y-env.sh
echo "export DISPLAY=:99" >> /tmp/a11y-env.sh
echo "export DBUS_SESSION_BUS_ADDRESS" >> /tmp/a11y-env.sh
echo "export GNOME_ACCESSIBILITY=1 GTK_MODULES=gail:atk-bridge QT_ACCESSIBILITY=1" >> /tmp/a11y-env.sh

/usr/libexec/at-spi-bus-launcher --launch-immediately >/tmp/atspi-bus.log 2>&1 &
sleep 2
/usr/libexec/at-spi2-registryd >/tmp/atspi-reg.log 2>&1 &
sleep 2

{
  echo "display=$(pgrep -cf 'Xvfb :99')"
  echo "windowmanager=$(pgrep -cf openbox)"
  echo "dbus=$(pgrep -cf 'dbus-daemon --syslog-only --fork')"
  echo "atspi_bus=$(pgrep -cf at-spi-bus-launcher)"
  echo "atspi_registry=$(pgrep -cf at-spi2-registryd)"
  gdbus call --session --dest org.a11y.Bus --object-path /org/a11y/bus \
    --method org.a11y.Bus.GetAddress 2>&1 | head -1
} > /tmp/a11y-status.txt 2>&1

echo READY >> /tmp/a11y-status.txt
echo "Stack up. Ctrl-C to stop."
while true; do sleep 30; done
