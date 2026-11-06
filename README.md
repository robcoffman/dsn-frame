# DSN Frame

A wall display for NASA's Deep Space Network. It shows which dishes at Goldstone, Madrid and Canberra are talking to which spacecraft. It also spotlights each active link in turn, with a photo and description of the spacecraft, its distance, signal travel time and data rates.

The data comes from the same public feed that powers NASA's DSN Now page. Spacecraft photos and descriptions come from Wikipedia. Both are cached locally.

## Files

| File | What it is |
|---|---|
| `index.html` | The display. Plain HTML/CSS/JS, no WebGL, light enough for a Pi Zero 2 W. |
| `server.py` | Tiny Python server (standard library only). It serves the page and proxies and caches the NASA feed and Wikipedia so the browser never hits CORS. |
| `sample-dsn.xml` | Demo data, so you can try it with no network. |

## Try it on any computer

```bash
python3 server.py --port 8080
# live:  http://localhost:8080/
# demo:  http://localhost:8080/?demo
```

### URL options

| Option | Effect |
|---|---|
| `?demo` | Bundled sample data |
| `?lite` | Turn off continuous animations (recommended on a Pi Zero 2 W) |
| `?rotate=20` | Seconds per spotlight (default 15) |
| `?poll=20` | Seconds between feed refreshes (default 10) |

The layout switches automatically between landscape and portrait/square, so the same page works on a 16:9 frame or a screen turned on its side in a cube.

## Run with Docker

```bash
docker compose up -d --build
# http://localhost:8080/
```

The port is bound to localhost only. Change it to `"8080:8080"` in `compose.yaml` to reach it from other machines on your network.

## Use in OBS (video calls)

Add a **Browser Source** with URL `http://localhost:8080/` (or the Docker/Pi host's address) and set the width and height to the shape you want. The layout adapts: 1920×1080 gives the full landscape view, while a tall size such as 1080×1920 gives the stacked portrait view. Untick *Shutdown source when not visible* so it doesn't reload each time you switch scenes. Then use *Start Virtual Camera* to send it to Zoom, Meet or Teams, or put it in a scene beside your webcam.

## Raspberry Pi setup (Raspberry Pi OS with desktop, Bookworm or newer)

1. Copy the folder to `/home/pi/dsn-frame`. Adjust the user/paths below if yours differ.

2. Run the server at boot as a systemd unit, `/etc/systemd/system/dsn-frame.service`:

   ```ini
   [Unit]
   Description=DSN Frame server
   After=network-online.target
   Wants=network-online.target

   [Service]
   User=pi
   WorkingDirectory=/home/pi/dsn-frame
   ExecStart=/usr/bin/python3 server.py --port 8080
   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```

   Enable it with `sudo systemctl enable --now dsn-frame`.

3. Open the kiosk at login by adding this to `~/.config/labwc/autostart`:

   ```bash
   chromium --kiosk --noerrdialogs --disable-infobars --incognito \
     --disable-session-crashed-bubble --check-for-update-interval=31536000 \
     "http://localhost:8080/" &
   ```

   Also set auto-login to desktop and turn off screen blanking in `raspi-config`.

4. For portrait (screen on its side), rotate the output in *Screen Configuration*, or run `wlr-randr --output HDMI-A-1 --transform 90`.

5. Optionally, sleep the screen overnight with cron (`crontab -e`):

   ```cron
   0 23 * * * WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/1000 wlr-randr --output HDMI-A-1 --off
   0 6  * * * WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/1000 wlr-randr --output HDMI-A-1 --on
   ```

## Pi Zero 2 W notes

The page itself is light. Chromium is the heavy part on 512 MB of RAM. Use `?lite&poll=20`, give it a 1 GB swap file, and expect a slow first load. A Pi 4 is the more comfortable choice, especially if this later grows into a calendar.

## If NASA's feed goes down

The server keeps serving the last good copy, and the status dot turns amber ("Feed delayed"). If there has never been a good copy, the dot turns red and the page keeps retrying.
