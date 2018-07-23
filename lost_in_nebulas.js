/**
 * CryptoHero Contract Nebulas Version
 * ©️ Andoromeda Foundation All Right Reserved.
 * @author: Frank Wei <frank@frankwei.xyz>
 * @version: 1.0
 */
"use strict"

class Operator {
    constructor(obj) {
        this.operator = {}
        this.parse(obj)
    }

    toString() {
        return JSON.stringify(this.operator)
    }

    parse(obj) {
        if (typeof obj != "undefined") {
            var data = JSON.parse(obj)
            for (var key in data) {
                this.operator[key] = data[key]
            }
        }
    }

    get(key) {
        return this.operator[key]
    }

    set(key, value) {
        this.operator[key] = value
    }
}

class Tool {
    static fromNasToWei(value) {
        return new BigNumber("1000000000000000000").times(value)
    }
    static fromWeiToNas(value) {
        if (value instanceof BigNumber) {
            return value.dividedBy("1000000000000000000")
        } else {
            return new BigNumber(value).dividedBy("1000000000000000000")
        }
    }
    static getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min)) + min;
    }
}

var Allowed = function (obj) {
    this.allowed = {};
    this.parse(obj);
}

Allowed.prototype = {
    toString: function () {
        return JSON.stringify(this.allowed);
    },

    parse: function (obj) {
        if (typeof obj != "undefined") {
            var data = JSON.parse(obj);
            for (var key in data) {
                this.allowed[key] = new BigNumber(data[key]);
            }
        }
    },

    get: function (key) {
        return this.allowed[key];
    },

    set: function (key, value) {
        this.allowed[key] = new BigNumber(value);
    }
}

var StandardToken = function () {
    LocalContractStorage.defineProperties(this, {
        _name: null,
        _symbol: null,
        _decimals: null,
        _totalSupply: {
            parse: function (value) {
                return new BigNumber(value);
            },
            stringify: function (o) {
                return o.toString(10);
            }
        }
    });

    LocalContractStorage.defineMapProperties(this, {
        "balances": {
            parse: function (value) {
                return new BigNumber(value);
            },
            stringify: function (o) {
                return o.toString(10);
            }
        },
        "allowed": {
            parse: function (value) {
                return new Allowed(value);
            },
            stringify: function (o) {
                return o.toString();
            }
        }
    });
}

StandardToken.prototype = {
    init: function (name, symbol, decimals, totalSupply) {
        this._name = name;
        this._symbol = symbol;
        this._decimals = decimals || 0;
        this._totalSupply = new BigNumber(totalSupply).mul(new BigNumber(10).pow(decimals));

        var from = Blockchain.transaction.from;
        this.balances.set(from, this._totalSupply);
        this.transferEvent(true, from, from, this._totalSupply);
    },

    // Returns the name of the token
    name: function () {
        return this._name;
    },

    // Returns the symbol of the token
    symbol: function () {
        return this._symbol;
    },

    // Returns the number of decimals the token uses
    decimals: function () {
        return this._decimals;
    },

    totalSupply: function () {
        return this._totalSupply.toString(10);
    },

    balanceOf: function (owner) {
        var balance = this.balances.get(owner);

        if (balance instanceof BigNumber) {
            return balance.toString(10);
        } else {
            return "0";
        }
    },

    transfer: function (to, value) {
        value = new BigNumber(value);
        if (value.lt(0)) {
            throw new Error("invalid value.");
        }

        var from = Blockchain.transaction.from;
        var balance = this.balances.get(from) || new BigNumber(0);

        if (balance.lt(value)) {
            throw new Error("transfer failed.");
        }

        this.balances.set(from, balance.sub(value));
        var toBalance = this.balances.get(to) || new BigNumber(0);
        this.balances.set(to, toBalance.add(value));

        this.transferEvent(true, from, to, value);
    },

    transferFrom: function (from, to, value) {
        var spender = Blockchain.transaction.from;
        var balance = this.balances.get(from) || new BigNumber(0);

        var allowed = this.allowed.get(from) || new Allowed();
        var allowedValue = allowed.get(spender) || new BigNumber(0);
        value = new BigNumber(value);

        if (value.gte(0) && balance.gte(value) && allowedValue.gte(value)) {

            this.balances.set(from, balance.sub(value));

            // update allowed value
            allowed.set(spender, allowedValue.sub(value));
            this.allowed.set(from, allowed);

            var toBalance = this.balances.get(to) || new BigNumber(0);
            this.balances.set(to, toBalance.add(value));

            this.transferEvent(true, from, to, value);
        } else {
            throw new Error("transfer failed.");
        }
    },

    transferEvent: function (status, from, to, value) {
        Event.Trigger(this.name(), {
            Status: status,
            Transfer: {
                from: from,
                to: to,
                value: value
            }
        });
    },

    approve: function (spender, currentValue, value) {
        var from = Blockchain.transaction.from;

        var oldValue = this.allowance(from, spender);
        if (oldValue != currentValue.toString()) {
            throw new Error("current approve value mistake.");
        }

        var balance = new BigNumber(this.balanceOf(from));
        var value = new BigNumber(value);

        if (value.lt(0) || balance.lt(value)) {
            throw new Error("invalid value.");
        }

        var owned = this.allowed.get(from) || new Allowed();
        owned.set(spender, value);

        this.allowed.set(from, owned);

        this.approveEvent(true, from, spender, value);
    },

    approveEvent: function (status, from, spender, value) {
        Event.Trigger(this.name(), {
            Status: status,
            Approve: {
                owner: from,
                spender: spender,
                value: value
            }
        });
    },

    allowance: function (owner, spender) {
        var owned = this.allowed.get(owner);

        if (owned instanceof Allowed) {
            var spender = owned.get(spender);
            if (typeof spender != "undefined") {
                return spender.toString(10);
            }
        }
        return "0";
    }
}

class ShareableToken extends StandardToken {
    constructor() {
        super()
        LocalContractStorage.defineProperties(this, {
            profitPool: null,     
            issuedSupply: null,
            //profit per token
            ppt: null

        })
        LocalContractStorage.defineMapProperties(this, {
            claimedProfit: null
        })
    }

    init(name, symbol, decimals, totalSupply) {
        super.init(name, symbol, decimals, totalSupply)
        this.ppt = 0
    }

    claimEvent(status, _from, _value) {
        Event.Trigger(this.name(), {
            Status: status,
            Transfer: {
                from: _from,
                value: _value
            }
        })
    }        

    claim() {
        var {
            from
        } = Blockchain.transaction
        var myProfit = ppt.mul(balances.get(from))
        var delta = myProfit.sub(claimedProfit.get(from))
        Blockchain.transfer(from, delta)
        this.claimEvent(true, from, delta)
        claimedProfit = myProfit
    }
}

class OwnerableContract extends ShareableToken {
    constructor() {
        super()
        LocalContractStorage.defineProperties(this, {
            owner: null
        })
        LocalContractStorage.defineMapProperties(this, {
            "admins": null
        })
    }
    //name, symbol, decimals, totalSupply

    init() {
        super.init("lost in nebulas", "lnb", "18", "1000000000000")
        const {
            from
        } = Blockchain.transaction
        this.admins.set(from, "true")
        this.owner = from
    }

    onlyAdmins() {
        const {
            from
        } = Blockchain.transaction
        if (!this.admins.get(from)) {
            throw new Error("Sorry, You don't have the permission as admins.")
        }
    }

    onlyContractOwner() {
        const {
            from
        } = Blockchain.transaction
        if (this.owner !== from) {
            throw new Error("Sorry, But you don't have the permission as owner.")
        }
    }

    getContractOwner() {
        return this.owner
    }

    getAdmins() {
        return this.admins
    }

    setAdmins(address) {
        this.onlyContractOwner()
        this.admins.set(address, "true")
    }
}

const K = Tool.fromNasToWei(0.00000001)
const initialTokenPrice = Tool.fromNasToWei(0.0000001)

class LostInNebulasContract extends OwnerableContract {
    constructor() {
        super()
        LocalContractStorage.defineProperties(this, {
            price: null,
            referCut: null,
            lastBuyTime: null,
        })
        LocalContractStorage.defineMapProperties(this, {
        })
    }

    getAmountByValue(value) {

        // (2p + kx)x/2 = value
        // kx^2 + 2px - 2value = 0

        var a = K;
        var b = this.price.mul(2);
        var c = -value.mul(2);

        var x = (-b.add(Math.sqrt(b.mul(b).sub(a.mul(c).mul(4))))).div((a.mul(2)));

        return x;
    }

    getValueByAmount(amount) {
        // (p + p - k*am)*am /2
        var value = this.price.add(this.price).sub(K.mul(amount).mul(amount).div(2));
        return value;
    }

    updateLastBuyTime() {
        this.lastBuyTime = Date.now();
    }    

    init() {
        this.price = initialTokenPrice
        super.init()
        var {
            from
        } = Blockchain.transaction        
        this.issuedSupply = 100
        this.transfer(from, 100)
        this.updateLastBuyTime()
    }
    
    buyEvent(status, _from, _value, _amount) {
        Event.Trigger(this.name(), {
            Status: status,
            Transfer: {
                from: _from,
                value: _value,
                amount: _amount
            }
        })
    }    

    sellEvent(status, _from, _amount, _value) {
        Event.Trigger(this.name(), {
            Status: status,
            Transfer: {
                from: _from,
                amount: _amount,              
                value: _value             
            }
        })
    }

    buy(referal = "") {
        var {
            from,
            value
        } = Blockchain.transaction
        amount = this.getAmountByValue(value)        
        if (amount > 1) this.updateLastBuyTime()
        
        this.profitPool = this.profitPool.add(value)
        this.ppt = this.profitPool.div(this.issuedSupply)
        this.transfer(from, amount)  
        this.price = this.price.add(K.mul(amount))
        this.buyEvent(true, from, value, amount)
        claimedProfit.set(from, claimedProfit.get(from).add(amount.mul(this.ppt)))        
    }

    sell(amount) {
        var {
            from,
        } = Blockchain.transaction
        var value = this.getValueByAmount(amount)        
        this.price = this.price.sub(K.mul(amount))
        Blockchain.transfer(from, value)
        this.sellEvent(true, from, amount, value)
        this.claim()
        claimedProfit.set(from, claimedProfit.get(from).sub(amount.mul(this.ppt)))      
    }
}

module.exports = LostInNebulasContract