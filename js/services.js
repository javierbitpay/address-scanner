var app = angular.module("addressScannApp.services",['ngLodash']);
app.service('scannServices',['$http', 'lodash',function($http, lodash){
	var bitcore = require('bitcore');
	var Transaction = bitcore.Transaction;
	var Address = bitcore.Address;
	var GAP = 20;
	var fee = 10000;
	var root = {};

	root.validateInput = function(dataInput, m, n){
		var result = "";
		var network = [];

		if(dataInput.length == n){
			lodash.each(dataInput, function(di){

				if (di.backup == "" || di.password == ""){
					result = "Please enter values for all entry boxes.";
					return result;
				}

				try{
					JSON.parse(di.backup);
				} 
				catch(e){
					result = "Your JSON is not valid, please copy only the text within (and including) the { } brackets around it.";
					return result;
				};

				try{
					sjcl.decrypt(di.password, di.backup);
				} 
				catch(e) {
					result = "Seems like your password is incorrect. Try again.";
					return result;
				};

				if ((JSON.parse(sjcl.decrypt(di.password, di.backup)).m != m) || (JSON.parse(sjcl.decrypt(di.password, di.backup)).n != n)){
					result = "The wallet types (m-n) was not matched with values provided.";
					console.log('Data input m-n: ' + m + '-' + n)
					console.log('Data backup m-n: ' + (JSON.parse(sjcl.decrypt(di.password, di.backup)).m + '-' + (JSON.parse(sjcl.decrypt(di.password, di.backup)).n)))
					return result;
				}

				if(JSON.parse(sjcl.decrypt(di.password, di.backup)).xPrivKey = ""){
	               result = "You are using a backup that can't be use to sign.";
	               return result;
	           	}

				network.push(JSON.parse(sjcl.decrypt(di.password, di.backup)).network);
			});

			if(result != ""){
				console.log("Validation result: " + result);
				return result;
			}
			else if(lodash.uniq(network).length > 1){
				result = "Check the input type networks.";
				console.log("Validation result: " + result);
				return result;
			}
			else{
				console.log("Validation result: Ok.");
				return true;
			}
		}else{
			result = "Please enter values for all entry boxes.";
			return result;
		}
	}

	root.validateAddress = function(addr, totalBtc, network){
		result = '';
		console.log('Validation in progress...');
		console.log('Address: ', addr, '\nTotal BTC: ', totalBtc, '\nNetwork: ', network);

		if(addr == '' || !Address.isValid(addr))
			return result = 'Please enter a valid address.';

		if((totalBtc * 100000000 - fee).toFixed(0) <= 0)
			return result = 'Funds are insufficient to complete the transaction';

		try{
			new Address(addr, network);
		}
		catch (e){
			return result = 'Address destination is not matched with the network backup type.';
		}

		if(result != ''){
			console.log("Validation result: " + result);
			return result;
		}
		else{
			console.log("Validation result: Ok.");
			return true;
		}
	}

	root.getBackupData = function(backup, password){
		var jBackup = JSON.parse(sjcl.decrypt(password, backup).toString());

		return {
			network: jBackup.network,
			xPrivKey: jBackup.xPrivKey,
			m: jBackup.m,
			n: jBackup.n
		};
	}

	root.getActiveAddresses = function(backupData, path, n, callback){
		var network = lodash.uniq(lodash.pluck(backupData, 'network')).toString();
		var inactiveCount = 0;
		var count = 0;
		var activeAddress = [];

		function derive(index){
			root.generateAddress(backupData, path, index, n, function(address){	
				root.getAddressData(address, network, function(addressData){

					if (!jQuery.isEmptyObject(addressData)) {
						activeAddress.push(addressData);
						inactiveCount = 0;
						console.log(">>>> Active address found!");
						console.log(addressData);
					}
					else 
						inactiveCount++;

					if (inactiveCount > GAP)
						return callback(activeAddress);
					else 
						derive(index + 1);
				});
			});
	    };
		derive(0);
	}

	root.generateAddress = function(backupData, path, index, n, callback){
		var derivedPublicKeys = [];
		var derivedPrivateKeys = [];
		var address = {};
		var network = lodash.uniq(lodash.pluck(backupData, 'network'));
		var xPrivKeys = lodash.pluck(backupData, 'xPrivKey');

		lodash.each(xPrivKeys, function(xpk){
			var hdPrivateKey = bitcore.HDPrivateKey(xpk);

			// private key derivation
			var derivedHdPrivateKey = hdPrivateKey.derive(path + index);
			var derivedPrivateKey = derivedHdPrivateKey.privateKey;
			derivedPrivateKeys.push(derivedPrivateKey);

			// public key derivation
			var derivedHdPublicKey = derivedHdPrivateKey.hdPublicKey;
			var derivedPublicKey = derivedHdPublicKey.publicKey;
			derivedPublicKeys.push(derivedPublicKey);
		});

		address = {
			addressObject: bitcore.Address.createMultisig(derivedPublicKeys, n * 1, network),
			pubKeys: derivedPublicKeys,
			privKeys: derivedPrivateKeys,
			path: path + index
		};

		return callback(address);
	}

	root.getAddressData = function(address, network, callback){
		// call insight API to get address information
		root.checkAddress(address.addressObject, network).then(function(respAddress){

			// call insight API to get utxo information
			root.checkUtxos(address.addressObject, network).then(function(respUtxo){

				var addressData = {};

				if(respAddress.data.unconfirmedTxApperances + respAddress.data.txApperances > 0){				
					addressData = {
						address: respAddress.data.addrStr, 
						balance: respAddress.data.balance,
						unconfirmedBalance: respAddress.data.unconfirmedBalance,
						utxo: respUtxo.data,
						privKeys: address.privKeys,
						pubKeys: address.pubKeys,
						path: address.path
					};
				}
				return callback(addressData);
			});
		});
	}

	root.checkAddress = function(address, netrowk){
		if(netrowk == 'testnet')
			return $http.get('https://test-insight.bitpay.com/api/addr/' + address + '?noTxList=1');
		else
			return $http.get('https://insight.bitpay.com/api/addr/' + address + '?noTxList=1');
	}

	root.checkUtxos = function(address, netrowk){
		if (netrowk == 'testnet')
	    	return $http.get('https://test-insight.bitpay.com/api/addr/' + address + '/utxo?noCache=1');
	    else
	    	return $http.get('https://insight.bitpay.com/api/addr/' + address + '/utxo?noCache=1');
    }

	root.createRawTx = function(address, netrowk, addressObjects, m){
		var tx = new Transaction();
		var privKeys = [];
		var totalBalance = 0;

		var address_ = new Address(address, netrowk);

		lodash.each(addressObjects, function(ao){
			if(ao.utxo.length > 0){
				lodash.each(ao.utxo, function(u){
					totalBalance += u.amount;
					tx.from(u, ao.pubKeys, m * 1);
					privKeys = privKeys.concat(ao.privKeys);
				});
			}
		});

		var amount = parseInt((totalBalance * 100000000 - fee).toFixed(0));
		
		tx.to(address, amount);
		tx.sign(lodash.uniq(privKeys));

		var rawTx = tx.serialize();
		console.log("Raw transaction: ", rawTx);
		return rawTx;
	}

	root.txBroadcast = function(rawTx, netrowk){
		if (netrowk == 'testnet')
			return $http.post('https://test-insight.bitpay.com/api/tx/send', {rawtx: rawTx});
		else
			return $http.post('https://insight.bitpay.com/api/tx/send', {rawtx: rawTx});
	}

	return root;
}]);







