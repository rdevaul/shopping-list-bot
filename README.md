# DeVaul Family Shopping List Bot

A Telegram bot with Mini App for managing a shared family shopping list.

## Features

- **Natural language**: "Add milk to the shopping list" (via GLaDOS)
- **Slash commands**: `/shop`, `/add`, `/remove`
- **Interactive Mini App**: Drag-drop reordering, tap to check off
- **Item types**:
  - **Staples**: Persist after checkout, auto-uncheck when re-added
  - **One-offs**: Disappear ~24h after checkout
- **Quantities**: "2 gallons of milk" → item "milk" with annotation "2 gallons"

## Architecture

- **Backend**: FastAPI (Python)
- **Storage**: Upstash Redis
- **Mini App**: React + Vite + dnd-kit
- **Bot**: python-telegram-bot

## Authorized Users

- Household group chat
- Rich, Dana, Terry (DMs)

## Setup

1. Copy `.env.example` to `.env`
2. Add bot token and Upstash credentials
3. `cd backend && pip install -r requirements.txt`
4. `cd mini-app && npm install`
5. Run with `./run.sh`

## Commands

- `/shop` - Open the shopping list Mini App
- `/add <item>` - Add an item
- `/remove <item>` - Remove an item
- `/staple <item>` - Mark item as staple
- `/clear` - Clear checked one-offs
