# Ploom

A personal screen + camera recorder for Windows and macOS. Records your screen (or one window) with a camera bubble, your mic, and computer sound, and saves an `.mp4` to your Videos folder.

## Setup

You need [Node.js](https://nodejs.org) (LTS) and [Git](https://git-scm.com).

```sh
git clone https://github.com/AlejandroA02/Ploom.git
cd Ploom
npm install
npm start
```

After the first time, just `npm start` from the `Ploom` folder.

## Using it

- Pick a screen or window and a mic from the bar, then hit record (or press `Ctrl+Shift+L` / `Cmd+Shift+L` to start and stop).
- Toggle the camera bubble and computer sound with the bar icons. Drag the bubble anywhere; S/M/L resizes it.
- The bar and countdown never show up in the recording.
- Recordings are saved to `Videos/Ploom` (Windows) or `Movies/Ploom` (macOS).

## macOS permissions

When run with `npm start`, macOS asks for permissions on behalf of your **terminal app** (Terminal, iTerm, VS Code…), not Ploom. On first run:

1. Allow **Camera** and **Microphone** when prompted.
2. In **System Settings → Privacy & Security → Screen & System Audio Recording**, turn on your terminal app, then quit and rerun `npm start`.

Computer sound needs macOS 14.2 or newer and the **System Audio Recording** permission for your terminal. If it's not available, Ploom tells you and records without it.

## License

[ISC](LICENSE)
