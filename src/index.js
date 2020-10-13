import EventEmitter from 'eventemitter3';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
const solana = window.solana

export default class Wallet extends EventEmitter {
  constructor() {
    super();
    this._publicKey = null;
    this._autoApprove = false;
    this._handlerAdded = false;
    this._nextRequestId = 1;
    this._responsePromises = new Map();
  }

  _handleMessage = (e) => {
  };
  
  _handleConnect(accounts) {
    if (accounts.length === 0) {
      console.error('Please connect to EzDeFi.');
      return;
    }
    try {
      const newPublicKey = new PublicKey(accounts[0])
      if (!this._publicKey || !this._publicKey.equals(newPublicKey)) {
        this._publicKey = newPublicKey;
        this.emit('connect', this._publicKey);
      }
    } catch(err) {
      console.error(err)
      this._publicKey = undefined;
      this.emit('connect', this._publicKey);
    }
  }

  _handleNetworkChanged(chainid) {
    if (this._publicKey) {
      this.emit('connect', this._publicKey);
    }
  }

  _handleDisconnect = () => {
    if (this._publicKey) {
      this._publicKey = null;
      this.emit('disconnect');
    }
    this._responsePromises.forEach(([resolve, reject], id) => {
      this._responsePromises.delete(id);
      reject('Wallet disconnected');
    });
  };

  _sendRequest = async (method, params) => {
    if (!this.connected) {
      throw new Error('Wallet not connected');
    }
    return solana.request({method, params})
  };

  get publicKey() {
    return this._publicKey;
  }

  get connected() {
    return this._publicKey !== null;
  }

  get autoApprove() {
    return this._autoApprove;
  }

  connect = () => {
    if (!solana) {
      throw new Error('EzDeFi not installed');
    }
    solana.on('accountsChanged', this._handleConnect.bind(this));
    solana.on('chainChanged', this._handleNetworkChanged.bind(this));
    return solana.request({ method: 'wallet_requestAccounts' })
      .then(this._handleConnect.bind(this))
      .catch((err) => {
        if (err.code === 4001) {
          // EIP-1193 userRejectedRequest error
          // If this happens, the user rejected the connection request.
          console.log('Please connect to EzDeFi or MetaMask');
        } else {
          console.error(err);
        }
      });
  };

  disconnect = () => {
    this._handleDisconnect();
  };

  signMessage = (message) => {
    return this._sendRequest('wallet_sign', {message});
  };

  signTransaction = async (tx) => {
    try {
      return Promise.resolve(
        this._sendRequest('wallet_signTransaction', {
          message: bs58.encode(tx.serializeMessage()),
        }),
      ).then(function (response) {
        var signature = Buffer.from(bs58.decode(response.signature));
        var publicKey = new PublicKey(response.publicKey);
        tx.addSignature(publicKey, signature);
        return tx;
      });
    } catch (e) {
      return Promise.reject(e);
    }
  };

  sendTransaction = async (tx) => {
    const signData = tx.serializeMessage();
    const wireTx = tx._serialize(signData);
    const message = bs58.encode(wireTx);
    return this._sendRequest('wallet_sendTransaction', {message});
  }
}
