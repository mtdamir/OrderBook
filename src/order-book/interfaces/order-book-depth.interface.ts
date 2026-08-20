export interface OrderBookLevel {
  price: string;

  amount: string;

  total: string;
}

export interface OrderBookDepth {
  marketSymbol: string;

  bids: OrderBookLevel[];

  asks: OrderBookLevel[];

  updatedAt: string;
}