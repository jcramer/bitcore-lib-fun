# Bitcoin Cash & SLP Web Wallet

THIS WALLET IS CONSIDERED [ALPHA SOFTWARE](https://en.wikipedia.org/wiki/Software_release_life_cycle#Alpha). USE AT YOUR OWN RISK! WE ASSUME NO RESPONSIBILITY NOR LIABILITY IF THERE IS A BUG IN THIS IMPLEMENTATION.

## Getting Started

Connecting to a full node:

1. You will need to connect to a BCHD full node that has `slpindex` and `txindex` enabled (see `REACT_APP_RPC_SERVER` in .env.developement).  Run a BCHD full node locally with: `bchd --slpindex --txindex --grpclisten=0.0.0.0`.  You can download and install bchd with an slp-indexer at `https://github.com/simpleledgerinc/bchd`.

2. Using Chrome browser you can connect directly to your full node running by enabling the flag `chrome://flags/#allow-insecure-localhost`.

To run the reactjs web app:

```
npm i
npm start
```
