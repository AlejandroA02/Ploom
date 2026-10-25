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

`npm install` also adds **Ploom**: a Desktop shortcut on Windows (it points at this folder, so if you move the folder, run `npm install` again), or `Ploom.app` in Applications on macOS. The Mac app is a snapshot of the code, so after changing it run `npm run app` to rebuild.

## Using it

- Pick a screen or window and a mic from the bar, then hit record (or press `Ctrl+Shift+L` / `Cmd+Shift+L` to start and stop).
- Toggle the camera bubble and computer sound with the bar icons. Drag the bubble anywhere; S/M/L resizes it.
- The bar and countdown never show up in the recording.
- Recordings are saved to `Videos/Ploom` (Windows) or `Movies/Ploom` (macOS).

## macOS permissions

macOS lists the app as **Ploom**, or as your **terminal app** if you use `npm start`. On first run:

1. Allow **Camera** and **Microphone** when prompted.
2. In **System Settings → Privacy & Security → Screen & System Audio Recording**, turn on Ploom (or your terminal app), then quit and reopen it.

The first install creates a local "Ploom Dev" signing certificate and asks for your password to trust it. That keeps these permissions across `npm run app` rebuilds.

Computer sound needs macOS 14.2 or newer and the **System Audio Recording** permission. If it's not available, Ploom tells you and records without it.

## License

[ISC](LICENSE)
