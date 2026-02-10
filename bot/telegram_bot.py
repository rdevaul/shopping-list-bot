"""
DeVaul Family Shopping List - Telegram Bot
"""
import os
import logging
import httpx
from typing import Optional

from telegram import Update, WebAppInfo, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    ContextTypes,
    filters,
)
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
API_URL = os.getenv("API_URL", "http://localhost:8200")
MINI_APP_URL = os.getenv("MINI_APP_URL", "https://your-domain/shop")

# Authorized users
AUTHORIZED_USERS = set(
    int(uid) for uid in os.getenv("AUTHORIZED_USERS", "").split(",") if uid
)
HOUSEHOLD_GROUP_ID = int(os.getenv("HOUSEHOLD_GROUP_ID", "0"))


def is_authorized(user_id: int, chat_id: int) -> bool:
    """Check if user is authorized to use the bot."""
    # Allow if in household group
    if chat_id == HOUSEHOLD_GROUP_ID:
        return True
    # Allow if user is in authorized list (for DMs)
    if user_id in AUTHORIZED_USERS:
        return True
    return False


async def shop_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /shop command - open the Mini App."""
    user_id = update.effective_user.id
    chat_id = update.effective_chat.id
    
    if not is_authorized(user_id, chat_id):
        await update.message.reply_text("Sorry, you're not authorized to use this bot.")
        return
    
    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton(
            "🛒 Open Shopping List",
            web_app=WebAppInfo(url=MINI_APP_URL)
        )]
    ])
    
    await update.message.reply_text(
        "Tap below to open the shopping list:",
        reply_markup=keyboard
    )


async def add_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /add command."""
    user_id = update.effective_user.id
    chat_id = update.effective_chat.id
    
    if not is_authorized(user_id, chat_id):
        await update.message.reply_text("Sorry, you're not authorized to use this bot.")
        return
    
    if not context.args:
        await update.message.reply_text("Usage: /add <item>\nExample: /add milk")
        return
    
    item_name = " ".join(context.args)
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{API_URL}/items",
                json={"name": item_name, "added_by": user_id}
            )
            response.raise_for_status()
            item = response.json()
            await update.message.reply_text(f"✅ Added: {item['name']}")
        except Exception as e:
            logger.error(f"Failed to add item: {e}")
            await update.message.reply_text("❌ Failed to add item. Please try again.")


async def remove_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /remove command."""
    user_id = update.effective_user.id
    chat_id = update.effective_chat.id
    
    if not is_authorized(user_id, chat_id):
        return
    
    if not context.args:
        await update.message.reply_text("Usage: /remove <item>")
        return
    
    item_name = " ".join(context.args).lower()
    
    async with httpx.AsyncClient() as client:
        try:
            # Get all items and find matching one
            response = await client.get(f"{API_URL}/items")
            items = response.json()
            
            matching = next((i for i in items if i['name'].lower() == item_name), None)
            if matching:
                await client.delete(f"{API_URL}/items/{matching['id']}")
                await update.message.reply_text(f"✅ Removed: {item_name}")
            else:
                await update.message.reply_text(f"❌ Item not found: {item_name}")
        except Exception as e:
            logger.error(f"Failed to remove item: {e}")
            await update.message.reply_text("❌ Failed to remove item.")


async def staple_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /staple command - mark item as staple."""
    user_id = update.effective_user.id
    chat_id = update.effective_chat.id
    
    if not is_authorized(user_id, chat_id):
        return
    
    if not context.args:
        await update.message.reply_text("Usage: /staple <item>")
        return
    
    item_name = " ".join(context.args).lower()
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{API_URL}/items")
            items = response.json()
            
            matching = next((i for i in items if i['name'].lower() == item_name), None)
            if matching:
                await client.patch(
                    f"{API_URL}/items/{matching['id']}",
                    json={"is_staple": True}
                )
                await update.message.reply_text(f"⭐ Marked as staple: {item_name}")
            else:
                await update.message.reply_text(f"❌ Item not found: {item_name}")
        except Exception as e:
            logger.error(f"Failed to update item: {e}")


async def unstaple_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /unstaple command - demote staple to one-off."""
    user_id = update.effective_user.id
    chat_id = update.effective_chat.id
    
    if not is_authorized(user_id, chat_id):
        return
    
    if not context.args:
        await update.message.reply_text("Usage: /unstaple <item>")
        return
    
    item_name = " ".join(context.args).lower()
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{API_URL}/items")
            items = response.json()
            
            matching = next((i for i in items if i['name'].lower() == item_name), None)
            if matching:
                await client.patch(
                    f"{API_URL}/items/{matching['id']}",
                    json={"is_staple": False}
                )
                await update.message.reply_text(f"📝 Demoted to one-off: {item_name}")
            else:
                await update.message.reply_text(f"❌ Item not found: {item_name}")
        except Exception as e:
            logger.error(f"Failed to update item: {e}")


async def check_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /check command - mark item as checked."""
    user_id = update.effective_user.id
    chat_id = update.effective_chat.id
    
    if not is_authorized(user_id, chat_id):
        return
    
    if not context.args:
        await update.message.reply_text("Usage: /check <item>")
        return
    
    item_name = " ".join(context.args).lower()
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{API_URL}/items")
            items = response.json()
            
            matching = next((i for i in items if i['name'].lower() == item_name), None)
            if matching:
                await client.patch(
                    f"{API_URL}/items/{matching['id']}",
                    json={"checked": True}
                )
                await update.message.reply_text(f"✅ Checked: {item_name}")
            else:
                await update.message.reply_text(f"❌ Item not found: {item_name}")
        except Exception as e:
            logger.error(f"Failed to check item: {e}")


async def uncheck_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /uncheck command - uncheck an item."""
    user_id = update.effective_user.id
    chat_id = update.effective_chat.id
    
    if not is_authorized(user_id, chat_id):
        return
    
    if not context.args:
        await update.message.reply_text("Usage: /uncheck <item>")
        return
    
    item_name = " ".join(context.args).lower()
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{API_URL}/items")
            items = response.json()
            
            matching = next((i for i in items if i['name'].lower() == item_name), None)
            if matching:
                await client.patch(
                    f"{API_URL}/items/{matching['id']}",
                    json={"checked": False}
                )
                await update.message.reply_text(f"⬜ Unchecked: {item_name}")
            else:
                await update.message.reply_text(f"❌ Item not found: {item_name}")
        except Exception as e:
            logger.error(f"Failed to uncheck item: {e}")


async def clear_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /clear command - run cleanup."""
    user_id = update.effective_user.id
    chat_id = update.effective_chat.id
    
    if not is_authorized(user_id, chat_id):
        return
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(f"{API_URL}/cleanup")
            result = response.json()
            await update.message.reply_text(
                f"🧹 Cleanup complete. Removed {result.get('removed', 0)} old items."
            )
        except Exception as e:
            logger.error(f"Cleanup failed: {e}")


async def list_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /list command - show current list as text."""
    user_id = update.effective_user.id
    chat_id = update.effective_chat.id
    
    if not is_authorized(user_id, chat_id):
        return
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{API_URL}/items")
            items = response.json()
            
            if not items:
                await update.message.reply_text("🛒 Shopping list is empty!")
                return
            
            lines = ["🛒 **Shopping List**\n"]
            
            # Staples
            staples = [i for i in items if i['is_staple']]
            if staples:
                lines.append("⭐ **Staples:**")
                for item in staples:
                    check = "✅" if item['checked'] else "⬜"
                    qty = f" ({item['quantity']})" if item.get('quantity') else ""
                    lines.append(f"  {check} {item['name']}{qty}")
                lines.append("")
            
            # One-offs
            oneoffs = [i for i in items if not i['is_staple']]
            if oneoffs:
                lines.append("📝 **One-offs:**")
                for item in oneoffs:
                    check = "✅" if item['checked'] else "⬜"
                    qty = f" ({item['quantity']})" if item.get('quantity') else ""
                    lines.append(f"  {check} {item['name']}{qty}")
            
            await update.message.reply_text("\n".join(lines), parse_mode="Markdown")
            
        except Exception as e:
            logger.error(f"Failed to get list: {e}")
            await update.message.reply_text("❌ Failed to get list.")


HELP_TEXT = """🛒 **DeVaul Family Shopping List**

**Commands:**
/shop - Open the interactive Mini App
/list - View list as text
/add <item> - Add an item (e.g., /add milk)
/remove <item> - Remove an item
/staple <item> - Mark item as staple
/unstaple <item> - Demote staple to one-off
/check <item> - Mark item as checked
/uncheck <item> - Uncheck an item
/clear - Clean up old checked items
/help - Show this help message

**Mini App Features:**
• Tap checkbox to check/uncheck items
• Drag items to reorder
• Drag one-off → staples to promote
• Drag staple → one-offs to demote

**Natural Language:**
Just ask GLaDOS! "Add eggs to the shopping list"
"""


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /start command."""
    await update.message.reply_text(
        "👋 Welcome to the DeVaul Family Shopping List!\n\n"
        "Use /help to see all commands, or /shop to open the Mini App.\n\n"
        "You can also just ask GLaDOS to add things naturally!",
        parse_mode="Markdown"
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /help command."""
    await update.message.reply_text(HELP_TEXT, parse_mode="Markdown")


def main():
    """Start the bot."""
    if not BOT_TOKEN:
        raise ValueError("TELEGRAM_BOT_TOKEN not set")
    
    app = Application.builder().token(BOT_TOKEN).build()
    
    # Add handlers
    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(CommandHandler("shop", shop_command))
    app.add_handler(CommandHandler("add", add_command))
    app.add_handler(CommandHandler("remove", remove_command))
    app.add_handler(CommandHandler("staple", staple_command))
    app.add_handler(CommandHandler("unstaple", unstaple_command))
    app.add_handler(CommandHandler("check", check_command))
    app.add_handler(CommandHandler("uncheck", uncheck_command))
    app.add_handler(CommandHandler("clear", clear_command))
    app.add_handler(CommandHandler("list", list_command))
    
    logger.info("Starting bot...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
