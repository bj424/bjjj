from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
import random


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Blackjack Game Models
class Card(BaseModel):
    suit: str  # hearts, diamonds, clubs, spades
    rank: str  # A, 2, 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K
    value: int  # Numerical value for game logic
    display: str  # Display name (A, 2-10, J, Q, K)

class GameState(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    player_cards: List[Card] = []
    dealer_cards: List[Card] = []
    player_score: int = 0
    dealer_score: int = 0
    game_status: str = "waiting"  # waiting, playing, player_win, dealer_win, push, player_bust, dealer_bust
    bet_amount: float = 0
    balance: float = 1000.0
    created_at: datetime = Field(default_factory=datetime.utcnow)

class BetRequest(BaseModel):
    amount: float

class GameAction(BaseModel):
    action: str  # hit, stand, new_game


# Game Logic Functions
def create_deck():
    """Create a standard 52-card deck"""
    suits = ['hearts', 'diamonds', 'clubs', 'spades']
    ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
    deck = []
    
    for suit in suits:
        for rank in ranks:
            if rank == 'A':
                value = 11  # Ace starts as 11, will be adjusted if needed
            elif rank in ['J', 'Q', 'K']:
                value = 10
            else:
                value = int(rank)
            
            deck.append(Card(
                suit=suit,
                rank=rank,
                value=value,
                display=rank
            ))
    
    random.shuffle(deck)
    return deck

def calculate_score(cards: List[Card]) -> int:
    """Calculate the best possible score for a hand"""
    score = 0
    aces = 0
    
    for card in cards:
        if card.rank == 'A':
            aces += 1
            score += 11
        else:
            score += card.value
    
    # Adjust for aces
    while score > 21 and aces > 0:
        score -= 10
        aces -= 1
    
    return score

def determine_winner(player_score: int, dealer_score: int) -> str:
    """Determine the winner of the game"""
    if player_score > 21:
        return "dealer_win"
    elif dealer_score > 21:
        return "player_win"
    elif player_score > dealer_score:
        return "player_win"
    elif dealer_score > player_score:
        return "dealer_win"
    else:
        return "push"


# Game state storage (in production, use database)
game_sessions = {}


# API Routes
@api_router.get("/")
async def root():
    return {"message": "Blackjack API Ready"}

@api_router.post("/game/new")
async def new_game():
    """Start a new blackjack game"""
    game_id = str(uuid.uuid4())
    deck = create_deck()
    
    # Deal initial cards
    player_cards = [deck.pop(), deck.pop()]
    dealer_cards = [deck.pop(), deck.pop()]
    
    player_score = calculate_score(player_cards)
    dealer_score = calculate_score([dealer_cards[0]])  # Only show first dealer card
    
    game_state = GameState(
        id=game_id,
        player_cards=player_cards,
        dealer_cards=dealer_cards,
        player_score=player_score,
        dealer_score=dealer_score,
        game_status="playing"
    )
    
    # Store game state and remaining deck
    game_sessions[game_id] = {
        "game_state": game_state,
        "deck": deck
    }
    
    return game_state

@api_router.post("/game/{game_id}/bet")
async def place_bet(game_id: str, bet_request: BetRequest):
    """Place a bet for the game"""
    if game_id not in game_sessions:
        return {"error": "Game not found"}
    
    game_session = game_sessions[game_id]
    game_state = game_session["game_state"]
    
    if bet_request.amount > game_state.balance:
        return {"error": "Insufficient balance"}
    
    game_state.bet_amount = bet_request.amount
    game_state.balance -= bet_request.amount
    
    return game_state

@api_router.post("/game/{game_id}/action")
async def game_action(game_id: str, action: GameAction):
    """Perform a game action (hit, stand)"""
    if game_id not in game_sessions:
        return {"error": "Game not found"}
    
    game_session = game_sessions[game_id]
    game_state = game_session["game_state"]
    deck = game_session["deck"]
    
    if action.action == "hit":
        # Deal card to player
        if deck:
            new_card = deck.pop()
            game_state.player_cards.append(new_card)
            game_state.player_score = calculate_score(game_state.player_cards)
            
            if game_state.player_score > 21:
                game_state.game_status = "player_bust"
            
    elif action.action == "stand":
        # Dealer plays
        full_dealer_score = calculate_score(game_state.dealer_cards)
        
        # Dealer hits on 16 and below
        while full_dealer_score < 17 and deck:
            new_card = deck.pop()
            game_state.dealer_cards.append(new_card)
            full_dealer_score = calculate_score(game_state.dealer_cards)
        
        game_state.dealer_score = full_dealer_score
        
        if full_dealer_score > 21:
            game_state.game_status = "dealer_bust"
            # Player wins
            game_state.balance += game_state.bet_amount * 2
        else:
            result = determine_winner(game_state.player_score, full_dealer_score)
            game_state.game_status = result
            
            if result == "player_win":
                game_state.balance += game_state.bet_amount * 2
            elif result == "push":
                game_state.balance += game_state.bet_amount
    
    return game_state

@api_router.get("/game/{game_id}")
async def get_game_state(game_id: str):
    """Get current game state"""
    if game_id not in game_sessions:
        return {"error": "Game not found"}
    
    return game_sessions[game_id]["game_state"]


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()