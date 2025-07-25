import React, { useState, useEffect } from "react";
import "./App.css";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const BlackjackGame = () => {
  const [gameState, setGameState] = useState(null);
  const [gameId, setGameId] = useState(null);
  const [betAmount, setBetAmount] = useState(1);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [balance, setBalance] = useState(1000);
  const [isDistributing, setIsDistributing] = useState(false);
  const [dealingOrder, setDealingOrder] = useState([]);
  const [visibleCards, setVisibleCards] = useState({ player: [], dealer: [] });
  const [editingBalance, setEditingBalance] = useState(false);

  // Simulate realistic card distribution - Logique simplifiée sans duplication
  const distributeCards = (cards, dealerCards) => {
    setIsDistributing(true);
    
    // Initialiser avec les cartes réelles mais avec flags d'animation
    const playerCardsWithAnimation = cards.map((card, index) => ({
      ...card,
      isTraveling: true,
      key: `player-${Date.now()}-${index}`
    }));
    
    const dealerCardsWithAnimation = dealerCards.map((card, index) => ({
      ...card,
      isTraveling: true,
      isHidden: index === 1, // Deuxième carte du croupier cachée
      key: `dealer-${Date.now()}-${index}`
    }));
    
    // Distribution immédiate avec toutes les cartes
    setVisibleCards({
      player: playerCardsWithAnimation,
      dealer: dealerCardsWithAnimation
    });
    
    // Animer les retournements progressivement
    const distributionOrder = [0, 1, 2, 3]; // Ordre des cartes
    distributionOrder.forEach((cardIndex, animIndex) => {
      setTimeout(() => {
        setVisibleCards(prev => {
          const newVisible = { ...prev };
          
          if (cardIndex < 2) { // Cartes joueur
            newVisible.player = prev.player.map((card, idx) => 
              idx === cardIndex ? { ...card, isTraveling: false, isFlipping: true } : card
            );
          } else { // Cartes croupier
            const dealerIndex = cardIndex - 2;
            newVisible.dealer = prev.dealer.map((card, idx) => 
              idx === dealerIndex ? { 
                ...card, 
                isTraveling: false, 
                isFlipping: dealerIndex === 0 // Seule la première carte du croupier se retourne
              } : card
            );
          }
          
          return newVisible;
        });
        
        // Terminer l'animation de flip
        setTimeout(() => {
          setVisibleCards(prev => {
            const newVisible = { ...prev };
            
            if (cardIndex < 2) { // Cartes joueur
              newVisible.player = prev.player.map((card, idx) => 
                idx === cardIndex ? { ...card, isFlipping: false } : card
              );
            } else { // Cartes croupier
              const dealerIndex = cardIndex - 2;
              newVisible.dealer = prev.dealer.map((card, idx) => 
                idx === dealerIndex ? { ...card, isFlipping: false } : card
              );
            }
            
            return newVisible;
          });
        }, 300);
        
        // Fin de distribution après la dernière carte
        if (animIndex === distributionOrder.length - 1) {
          setTimeout(() => {
            setIsDistributing(false);
          }, 600);
        }
      }, animIndex * 600);
    });
  };

  // Start new game
  const startNewGame = async () => {
    try {
      const response = await axios.post(`${API}/game/new`);
      setGameState(response.data);
      setGameId(response.data.id);
      setBetAmount(1);
      setShowResult(false);
      
      // Start realistic card distribution
      distributeCards(response.data.player_cards, response.data.dealer_cards);
      
    } catch (error) {
      console.error("Error starting new game:", error);
    }
  };

  // Place bet
  const placeBet = async () => {
    if (!gameId) return;
    
    try {
      const response = await axios.post(`${API}/game/${gameId}/bet`, {
        amount: betAmount
      });
      setGameState(response.data);
      setBalance(response.data.balance);
    } catch (error) {
      console.error("Error placing bet:", error);
    }
  };

  // Tirer (Hit) action - Sans duplication
  const tirer = async () => {
    if (!gameId || isAnimating || isDistributing) return;
    
    setIsAnimating(true);
    
    try {
      const response = await axios.post(`${API}/game/${gameId}/action`, {
        action: "hit"
      });
      
      const newCard = response.data.player_cards[response.data.player_cards.length - 1];
      const cardKey = `player-hit-${Date.now()}`;
      
      // Ajouter la nouvelle carte avec animation
      setVisibleCards(prev => ({
        ...prev,
        player: [...prev.player, { ...newCard, isTraveling: true, key: cardKey }]
      }));
      
      // Retourner la carte après le vol
      setTimeout(() => {
        setVisibleCards(prev => ({
          ...prev,
          player: prev.player.map(card => 
            card.key === cardKey 
              ? { ...card, isTraveling: false, isFlipping: true }
              : card
          )
        }));
        
        // Finir l'animation de retournement
        setTimeout(() => {
          setVisibleCards(prev => ({
            ...prev,
            player: prev.player.map(card => 
              card.key === cardKey 
                ? { ...card, isFlipping: false }
                : card
            )
          }));
          
          setGameState(response.data);
          setBalance(response.data.balance);
          setIsAnimating(false);
          
          // Show result if game ended
          if (response.data.game_status !== "playing") {
            // If player busts, reveal dealer's hidden card
            if (response.data.game_status === "player_bust") {
              setTimeout(() => {
                setVisibleCards(prev => ({
                  ...prev,
                  dealer: prev.dealer.map((card, index) => 
                    index === 1 ? { ...card, isHidden: false } : card
                  )
                }));
              }, 400);
            }
            setTimeout(() => setShowResult(true), 800);
          }
        }, 300);
      }, 400);
      
    } catch (error) {
      console.error("Error hitting:", error);
      setIsAnimating(false);
    }
  };

  // Rester (Stand) action - Animation complète pour toutes les cartes du croupier
  const rester = async () => {
    if (!gameId || isAnimating || isDistributing) return;
    
    setIsAnimating(true);
    
    try {
      const response = await axios.post(`${API}/game/${gameId}/action`, {
        action: "stand"
      });
      
      // First reveal dealer's hidden card (no animation, just flip)
      setTimeout(() => {
        setVisibleCards(prev => ({
          ...prev,
          dealer: prev.dealer.map((card, index) => 
            index === 1 ? { ...card, isHidden: false } : card
          )
        }));
        
        // Then add any additional dealer cards one by one with full animation
        const additionalCards = response.data.dealer_cards.slice(2);
        
        if (additionalCards.length > 0) {
          // Animer chaque carte additionnelle depuis la pioche
          additionalCards.forEach((card, index) => {
            setTimeout(() => {
              // Étape 1: Ajouter carte en vol (face cachée)
              setVisibleCards(prev => ({
                ...prev,
                dealer: [...prev.dealer, { ...card, isTraveling: true }]
              }));
              
              // Étape 2: Après le vol, retourner la carte
              setTimeout(() => {
                const cardIndex = visibleCards.dealer.length + index;
                setVisibleCards(prev => {
                  const newVisible = { ...prev };
                  const lastIndex = newVisible.dealer.length - 1;
                  newVisible.dealer[lastIndex] = { 
                    ...card, 
                    isTraveling: false, 
                    isFlipping: true 
                  };
                  return newVisible;
                });
                
                // Étape 3: Finir l'animation de retournement
                setTimeout(() => {
                  setVisibleCards(prev => {
                    const newVisible = { ...prev };
                    const lastIndex = newVisible.dealer.length - 1;
                    newVisible.dealer[lastIndex] = { 
                      ...card, 
                      isFlipping: false 
                    };
                    return newVisible;
                  });
                }, 300); // Fin du retournement
              }, 400); // Fin du vol
              
            }, index * 800); // 800ms entre chaque carte du croupier
          });
        }
        
        // Update game state and show result after all animations
        const totalAnimationTime = additionalCards.length * 800 + 800;
        setTimeout(() => {
          setGameState(response.data);
          setBalance(response.data.balance);
          setIsAnimating(false);
          setTimeout(() => setShowResult(true), 600);
        }, totalAnimationTime);
        
      }, 500);
      
    } catch (error) {
      console.error("Error standing:", error);
      setIsAnimating(false);
    }
  };

  // Card component - Vol face cachée puis retournement 3D
  const Card = ({ card, isHidden = false, isDealer = false, index = 0, isWinning = false, isDistributing = false }) => {
    const getCardSymbol = (suit) => {
      const symbols = {
        hearts: "♥",
        diamonds: "♦", 
        clubs: "♣",
        spades: "♠"
      };
      return symbols[suit] || "";
    };

    const getCardColor = (suit) => {
      return suit === "hearts" || suit === "diamonds" ? "#E74C3C" : "#2C3E50";
    };

    // Carte face cachée pendant le voyage ou si explicitement cachée
    if (card?.isTraveling || isHidden || card?.isHidden) {
      return (
        <div 
          className={`card card-back ${card?.isTraveling ? 'card-dealing' : ''}`}
          style={{ 
            animationDelay: `${index * 600}ms`,
            zIndex: 10 - index 
          }}
        >
          <div className="card-back-content">
            <div className="card-pattern"></div>
          </div>
        </div>
      );
    }

    // Carte face visible avec effet de retournement si nécessaire
    return (
      <div 
        className={`card ${card?.isFlipping ? 'card-flipping' : ''} ${isWinning ? 'card-winning' : ''}`}
        style={{ 
          animationDelay: `${index * 600}ms`,
          zIndex: 10 - index,
          color: getCardColor(card.suit)
        }}
      >
        <div className="card-content">
          <div className="card-rank">{card.display}</div>
          <div className="card-suit">{getCardSymbol(card.suit)}</div>
        </div>
      </div>
    );
  };

  // Balance editor
  const handleBalanceEdit = (newBalance) => {
    const balance = parseFloat(newBalance);
    if (!isNaN(balance) && balance >= 0) {
      setBalance(balance);
    }
    setEditingBalance(false);
  };

  // Get game result message in French
  const getResultMessage = () => {
    if (!gameState || !showResult) return null;
    
    const { game_status, bet_amount } = gameState;
    
    switch (game_status) {
      case "player_win":
      case "dealer_bust":
        return { type: "win", text: `VOUS GAGNEZ +${bet_amount}€` };
      case "dealer_win":
      case "player_bust":
        return { type: "lose", text: `VOUS PERDEZ -${bet_amount}€` };
      case "push":
        return { type: "push", text: "ÉGALITÉ" };
      default:
        return null;
    }
  };

  const result = getResultMessage();

  // Calculate final dealer score helper
  const calculateFinalDealerScore = () => {
    if (!gameState || gameState.game_status === "playing") return gameState?.dealer_score || 0;
    
    let score = 0;
    let aces = 0;
    
    for (let card of gameState.dealer_cards) {
      if (card.rank === 'A') {
        aces += 1;
        score += 11;
      } else {
        score += card.value;
      }
    }
    
    while (score > 21 && aces > 0) {
      score -= 10;
      aces -= 1;
    }
    
    return score;
  };

  useEffect(() => {
    startNewGame();
  }, []);

  if (!gameState) {
    return (
      <div className="blackjack-container">
        <div className="loading">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="blackjack-container">
      {/* Card Deck Pile - Top Right */}
      <div className="card-deck">
        <div className="deck-cards">
          <div className="deck-card deck-card-1"></div>
          <div className="deck-card deck-card-2"></div>
          <div className="deck-card deck-card-3"></div>
        </div>
      </div>

      {/* Header */}
      <div className="header">
        <div className="game-title">
          <span>🃏 Blackjack</span>
        </div>
        
        <div className={`balance ${result?.type === "win" && showResult ? 'balance-winning' : ''}`}>
          {editingBalance ? (
            <input
              type="number"
              className="balance-input"
              defaultValue={balance}
              onBlur={(e) => handleBalanceEdit(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleBalanceEdit(e.target.value)}
              autoFocus
            />
          ) : (
            <span onClick={() => setEditingBalance(true)}>
              {balance.toFixed(2)}€
            </span>
          )}
        </div>
        
        <div className="header-actions">
          <button className="wallet-btn">Portefeuille</button>
        </div>
      </div>

      {/* Game Info */}
      <div className="game-info">
        <div className="payout-info">BLACKJACK PAIE 3 CONTRE 2</div>
        <div className="insurance-info">ASSURANCE PAIE 2 CONTRE 1</div>
      </div>

      {/* Game Area */}
      <div className="game-area">
        {/* Dealer Section */}
        <div className="dealer-section">
          <div className="section-label">
            <span>Croupier</span>
            <span className="score">
              {gameState.game_status === "playing" ? 
                visibleCards.dealer.filter(c => !c.isHidden).reduce((sum, card) => {
                  return sum + (card.rank === 'A' ? 11 : card.value);
                }, 0) : 
                calculateFinalDealerScore()
              }
            </span>
          </div>
          <div className="cards-container">
            {visibleCards.dealer.map((card, index) => (
              <Card 
                key={`dealer-${index}`}
                card={card}
                isHidden={card.isHidden}
                isDealer={true}
                index={index}
                isDistributing={isDistributing}
              />
            ))}
          </div>
        </div>

        {/* Player Section */}
        <div className="player-section">
          <div className="section-label">
            <span>Joueur</span>  
            <span className="score">{gameState.player_score}</span>
          </div>
          <div className="cards-container">
            {visibleCards.player.map((card, index) => (
              <Card 
                key={`player-${index}`}
                card={card}
                index={index}
                isWinning={result?.type === "win" && showResult}
                isDistributing={isDistributing}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Result Banner */}
      {result && showResult && (
        <div className={`result-banner ${result.type}`}>
          {result.text}
        </div>
      )}

      {/* Betting Controls */}
      <div className="betting-controls">
        <div className="bet-amount">
          <label>Mise</label>
          <div className="bet-input-container">
            <input 
              type="number" 
              value={betAmount} 
              onChange={(e) => setBetAmount(Number(e.target.value))}
              min="1"
              max={balance}
            />
            <div className="bet-buttons">
              <button onClick={() => setBetAmount(Math.max(1, betAmount + 1))}>+1</button>
              <button onClick={() => setBetAmount(Math.max(1, betAmount + 5))}>+5</button>
              <button onClick={() => setBetAmount(Math.max(1, betAmount + 25))}>+25</button>
              <button onClick={() => setBetAmount(Math.max(1, betAmount + 100))}>+100</button>
            </div>
          </div>
        </div>
      </div>

      {/* Game Controls */}
      <div className="game-controls">
        {gameState.game_status === "playing" ? (
          <>
            <button 
              className="control-btn hit-btn" 
              onClick={tirer}
              disabled={isAnimating || isDistributing}
            >
              <span className="btn-icon">🔥</span>
              Tirer
            </button>
            <button 
              className="control-btn stand-btn" 
              onClick={rester}
              disabled={isAnimating || isDistributing}
            >
              Rester
            </button>
          </>
        ) : (
          <button 
            className="control-btn deal-btn" 
            onClick={startNewGame}
            disabled={isDistributing}
          >
            Nouvelle Partie
          </button>
        )}
      </div>
    </div>
  );
};

function App() {
  return (
    <div className="App">
      <BlackjackGame />
    </div>
  );
}

export default App;