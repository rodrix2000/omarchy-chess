# Command Reference

## Install

```bash
omarchy plugin add https://github.com/rodrix2000/omarchy-chess.git --enable
```

## Enable/disable

```bash
omarchy plugin enable io.github.rodrix2000.chess --section right
omarchy plugin disable io.github.rodrix2000.chess
```

## Open/toggle

```bash
omarchy-shell shell toggle io.github.rodrix2000.chess '{}'
```

## Open home

```bash
omarchy-shell shell summon io.github.rodrix2000.chess '{"view":"home"}'
```

## Resume

```bash
omarchy-shell shell summon io.github.rodrix2000.chess '{"action":"resume"}'
```

## Start a computer game

```bash
omarchy-shell shell summon io.github.rodrix2000.chess \
  '{"action":"new","mode":"computer","color":"white","difficulty":"casual"}'
```

The final implementation must confirm which payload actions are publicly supported and document only stable ones.

## Validate

```bash
omarchy plugin validate ~/.config/omarchy/plugins/io.github.rodrix2000.chess
```

## Update

```bash
omarchy plugin update io.github.rodrix2000.chess
```

## Remove plugin source

```bash
omarchy plugin remove io.github.rodrix2000.chess
```

## Delete all user data

```bash
rm -rf "${XDG_STATE_HOME:-$HOME/.local/state}/omarchy-chess"
```

This permanently deletes active games, history, settings, and recovery files.

## Development

From a clean local checkout, use the same Omarchy lifecycle as a public install:

```bash
./scripts/validate.sh
omarchy plugin remove io.github.rodrix2000.chess --yes
omarchy plugin add "file://$PWD" --enable --yes
```

Removing the installed source leaves the state directory intact. Commit local
changes before reinstalling because the Omarchy command clones the checkout.

## Logs

```bash
journalctl --user --since -10min | grep -i 'chess\|omarchy'
```
