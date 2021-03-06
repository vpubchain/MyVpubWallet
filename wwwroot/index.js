﻿function goToSendPanel(successfullyConnectedMessage) {
	window.clearInterval(autoConnect);
	$("#main-panel").hide();
	$("#send-panel").show();
	if (ledgerVpub || trezorVpub)
		$("#hardware-wallets-panel").hide();
	$("#title").text("发送维公币");
	$("#response").show().css("color", "black").html(successfullyConnectedMessage);
	$("#resultPanel").text("");
	$("#main-page-title").text("退出钱包");
}

function showNumber(amount, decimals) {
	var result;
	if (decimals === 3) {
		result = parseFloat(Math.round(amount * 1000) / 1000).toFixed(decimals);
	}
	else if (decimals === 4) {
		result = parseFloat(Math.round(amount * 10000) / 10000).toFixed(decimals);
		// If we have more than 1 leading digits before the . remove the last digit after the dot
		if (result.length > 6)
			result = result.substring(0, result.length - 1);
	}
	else if (decimals === 5) {
		result = parseFloat(Math.round(amount * 100000) / 100000).toFixed(decimals);
		// If we have more than 1 leading digits before the . remove the last digit after the dot
		if (result.length > 7)
			result = result.substring(0, result.length - 1);
	}
	else if (decimals === 6)
		result = parseFloat(Math.round(amount * 1000000) / 1000000).toFixed(decimals);
	else if (decimals === 7)
		result = parseFloat(Math.round(amount * 10000000) / 10000000).toFixed(decimals);
	else if (decimals === 8)
		result = parseFloat(Math.round(amount * 100000000) / 100000000).toFixed(decimals);
	else
		result = parseFloat(amount).toFixed(decimals);
	// Always cut off the last bunch of zeros (except if we requested 2 decimals for currencies)
	if (decimals > 2)
		for (var i = 0; i < 9; i++) {
			var isDot = result.endsWith('.');
			if (result.endsWith('0') || isDot) {
				result = result.substring(0, result.length - 1);
				if (isDot)
					break;
			} else
				break;
		}
	if (result === "")
		return 0;
	return result;
}

// Helper to show amount in VP if it is above 0.1 VP, otherwise show it in mVP. Will always
// show the exact number up to 8 (for VP) or 5 (for mVP) decimals to represent all duffs!
function showVpubOrMVpubNumber(amount) {
	if (amount > 0.1)
		return showNumber(amount, 8) + " VP";
	return showNumber(amount * 1000, 5) + " mVP";
}

var ledgerVpub;
//https://stackoverflow.com/questions/1208222/how-to-do-associative-array-hashing-in-javascript
var addressBalances = {};
var autoBalanceCheck;

function isValidVpubAddress(address) {
	return address && address.length >= 34 && (address[0] === 'X' || address[0] === 'x');
}

function updateLocalStorageBalances() {
	var totalAmount = 0;
	var cachedText = "";
	$.each(addressBalances,
		function (key, amount) {
            if (isValidVpubAddress(key)) {
                console.log("isValidVpubAddress:true------------------------");
				totalAmount += amount;
				cachedText += key + "|" + amount + "|";
			}
		});
	localStorage.setItem('addressBalances', cachedText);
	console.log("New total amount: " + totalAmount);
	return totalAmount;
}

//bitcore.Transaction.DUST_AMOUNT, the minimum we should ever have in an address or tx is 1000duffs
var DUST_AMOUNT = 1000;
var DUST_AMOUNT_IN_VPUB = 0.00001;
// Loops through all known Vpub addresses and checks the balance and sums up to total amount we got
function balanceCheck() {
	//keep displaying: document.getElementById("refreshing-amount-timeout").style.display = "none";
	$.each(addressBalances,
		function (addressToCheck, oldBalance) {
			if (isValidVpubAddress(addressToCheck)) {
                $.get("https://www.vpubchain.net/abe/chain/Vpub/q/addressbalance/" + addressToCheck,
                    function (data, status) {
						if (status === "success" && data !== "ERROR: address invalid" && oldBalance !== parseFloat(data)) {
							console.log("Updating balance of " + addressToCheck + ": " + data);
							addressBalances[addressToCheck] = parseFloat(data);
							if (addressBalances[addressToCheck] < DUST_AMOUNT_IN_VPUB)
								addressBalances[addressToCheck] = 0;
							updateLocalStorageBalancesAndRefreshTotalAmountAndReceivingAddresses();
						}
					});
			}
		});
}

var balanceCheckTime = 5;

function tryBalanceCheck() {
	document.getElementById("balance-check-time").innerHTML = balanceCheckTime + "s";
	if (balanceCheckTime === 0)
		balanceCheck();
	//always show: document.getElementById("refreshing-amount-timeout").style.display = balanceCheckTime === 0 ? "none" : "block";
	document.getElementById("refreshing-amount-timeout").style.display = "block";
	balanceCheckTime -= 1;
	if (balanceCheckTime === -1)
		balanceCheckTime = 10;
}

function updateLocalStorageBalancesAndRefreshTotalAmountAndReceivingAddresses() {
	var totalAmount = updateLocalStorageBalances();
	document.getElementById("totalAmountVpub").innerHTML = showNumber(totalAmount, 8);
	document.getElementById("totalAmountMVpub").innerHTML = showNumber(totalAmount * 1000, 5);
// ReSharper disable UseOfImplicitGlobalInFunctionScope
	//document.getElementById("totalAmountUsd").innerHTML = showNumber(totalAmount * usdRate, 2);
	//document.getElementById("totalAmountEur").innerHTML = showNumber(totalAmount * eurRate, 2);
	generateReceivingAddressList();
}

function getFreshestAddress() {
	if (trezorVpub)
		return trezorVpub.freshAddress;
	var freshestAddress = vpubKeystoreWallet ? vpubKeystoreWallet.address : "";
	$.each(addressBalances, function (address) { freshestAddress = address; });
	return freshestAddress;
}

function addAddressBalance(list, address, balance, freshestAddress) {
    var qrImg = "//api.qrserver.com/v1/create-qr-code/?size=240x240&data=vpub:" + address;
    $("<li><a href='https://www.vpubchain.net/abe/address/" +
		address +
		"' target='_blank' rel='noopener noreferrer'>" +
		(address === freshestAddress
			? "<img width='140' height='140' src='" +
			qrImg +
			"' title='Your freshest Vpub Address should be used for receiving Vpub, you will get a new one once this has been used!' /><br/>"
			: "") +
		address +
		"</a><div class='address-amount' onclick='setAmountToSend(" + balance + ")'>" +
		showVpubOrMVpubNumber(balance) + "</div></li>").prependTo(list);
}

function generateReceivingAddressList() {
	var list = $("#addressList");
	list.empty();
	var freshestAddress = getFreshestAddress();
	if (getNumberOfAddresses() > 0)
		$.each(addressBalances, function(address, balance) {
			addAddressBalance(list, address, balance, freshestAddress);
		});
	else
		addAddressBalance(list, freshestAddress, 0, freshestAddress);
}

function setAddressAndLookForLastUsedHdWalletAddress(firstAddress) {
	// Check if we were on this address the last time too, then we can use cached data
	var compressedCachedAddressBalances = localStorage.getItem('addressBalances');
	addressBalances = {};
	// Was cached and still on the same wallet as last time? Then restore all known address balances
	if (compressedCachedAddressBalances) {
		var parts = compressedCachedAddressBalances.split('|');
		if (firstAddress === parts[0]) {
			for (var i = 0; i < parts.length / 2; i++)
				if (parts[i * 2].length > 0)
					addressBalances[parts[i * 2]] = parseFloat(parts[i * 2 + 1]);
		}
	}
	if (!addressBalances[firstAddress]) {
		addressBalances[firstAddress] = 0;
		generateReceivingAddressList();
	}
	if (!autoBalanceCheck) {
		updateLocalStorageBalancesAndRefreshTotalAmountAndReceivingAddresses();
		balanceCheck();
		autoBalanceCheck = window.setInterval(tryBalanceCheck, 1000);
	}
	// Querying addresses is very slow on the ledger, go through them in packs of 3 if we got any
	// action on our first address (if not, keep that single one with 0 vpub so far).
	// And skip anything we have in our addressBalances list already, keep updating the cache.
	//console.log("got already " + getNumberOfAddresses() + " addresses");
	updateBalanceIfAddressIsUsed(getFreshestAddress());
}

function getNumberOfAddresses() {
	var num = 0;
	$.each(addressBalances, () => num++);
	return num;
}

function updateBalanceIfAddressIsUsed(newAddress) {
    $.get("https://www.vpubchain.net/abe/chain/Vpub/q/getreceivedbyaddress/" + newAddress,
		function (data, status) {
			if (status === "success" && data !== "ERROR: address invalid") {
				if (!addressBalances[newAddress]) {
					//console.log("Found new Vpub Address: " + newAddress);
					addressBalances[newAddress] = 0;
					// Update storage to not query this next time if this is in fact the newest empty address
					updateLocalStorageBalances();
					generateReceivingAddressList();
				}
				// If there was ever anything sent to this address, continue checking for more
				if (parseFloat(data) > 0)
					checkNextLedgerAddress();
			}
		});
}

function checkNextLedgerAddress() {
	//console.log("checkNextLedgerAddress got already " + getNumberOfAddresses() + " addresses");
	ledgerVpub.getWalletPublicKey_async("44'/5'/0'/0/" + getNumberOfAddresses()).then(
		function (result) {
			updateBalanceIfAddressIsUsed(result.bitcoinAddress);
		});
	// Algorithm is as follows:
	// 1. Get the next Vpub receiving addresses (will take about 300ms)
	// 2. Check them one-by-one via https://www.vpubchain.net/abe/chain/Vpub/q/getreceivedbyaddress/<address>
	// 3. If there was ever received something, add and continue
	// 4. Abort if this address has not received anything yet (still add it as last fresh one)
	// 5. If address had vpub received, continue with the next vpub address to check
}

var autoConnectTime = 0;
function tryAutoConnect() {
	$("#allowAutoConnectLedger").prop('checked', true);
	document.getElementById("auto-connect-time").innerHTML = " in " + autoConnectTime + "s";
	//console.log("toggleAutoConnect " + autoConnectTime);
	if (autoConnectTime === 0) {
		unlockLedger(false);
		//unused, must be done manually: unlockTrezor(false);
	}
	autoConnectTime -= 1;
	if (autoConnectTime === -1)
		autoConnectTime = 5;
}

var autoConnect;
if (localStorage.getItem('autoConnectLedger'))
	enableAutoConnect();

function toggleAutoConnectLedger() {
	if ($("#allowAutoConnectLedger").is(':checked'))
		enableAutoConnect();
	else
		disableAutoConnect();
}

function enableAutoConnect() {
	autoConnect = window.setInterval(tryAutoConnect, 1000);
	$("#autoConnectSpinner").show();
}

function disableAutoConnect() {
	if (autoConnect) {
		window.clearInterval(autoConnect);
		$("#autoConnectSpinner").hide();
		document.getElementById("auto-connect-time").innerHTML = "";
		autoConnect = undefined;
		localStorage.removeItem('autoConnectLedger');
	}
}

function unlockLedger(showResponse) {
	if (showResponse) {
		document.getElementById("response").style.display = "block";
		document.getElementById("response").style.color = "black";
		document.getElementById("response").innerHTML =
			"Connecting to Ledger Hardware Wallet ..<br />Make sure it is unlocked, in the VP app and browser settings are enabled!";
	}
	if (!ledgerVpub && !trezorVpub)
		ledger.comm_u2f.create_async(90).then(function (comm) {
			ledgerVpub = new ledger.btc(comm);
			//Retrieve public key with BIP 32 path, see https://www.ledgerwallet.com/api/demo.html
			ledgerVpub.getWalletPublicKey_async("44'/5'/0'/0/0").then(
				function (result) {
					try {
						// Remember to automatically connect to ledger next time we open the website
						localStorage.setItem('autoConnectLedger', true);
						goToSendPanel(
							"Successfully connected to Ledger Hardware Wallet, you can now confirm all features on this site with your device.");
						setAddressAndLookForLastUsedHdWalletAddress(result.bitcoinAddress);
					} catch (e) {
						document.getElementById("response").innerHTML = e.stack ? e.stack : e;
					}
				}).catch(
				function (error) {
					ledgerVpub = undefined;
					if (showResponse)
						document.getElementById("response").innerHTML =
							"Error connecting to Ledger Hardware Wallet: " + getLedgerErrorText(error) + "<br />" +
							"Please check the <a href='/AboutLedgerHardwareWallet'>Ledger Hardware Wallet Guide</a> for more help.";
				});
		});
}

function getLedgerErrorText(error) {
	//https://github.com/kvhnuke/etherwallet/issues/336
	if (error === "Invalid status 6985")
		return "User denied the transaction on the hardware device (invalid tx status 6985), aborting!";
	else if (error === "Invalid status 6a80")
		return "Invalid status 6a80: Data is not in a correct format and was rejected by the hardware device.";
	var errorText = error.errorCode ? "Unknown error, error code=" + error.errorCode : error;
	if (errorText === "No device found")
		errorText = "No device found. Make sure to connect a device and unlock it.";
	else if (error === "Invalid status 6804")
		errorText =
			"Security Exception. This means an invalid BIP32 path was provided. Do you have hardening in the right places?";
	else if (errorText === "Invalid status 6982")
		errorText = "Device timed out or is locked again. Please re-enter pin on the device.<br/>";
	//'OK': 0,
	//'OTHER_ERROR': 1,
	//'BAD_REQUEST': 2,
	//'CONFIGURATION_UNSUPPORTED': 3,
	//'DEVICE_INELIGIBLE': 4,
	//'TIMEOUT': 5
	else if (error.errorCode === 2)
		errorText =
			"Error code = 2. Not running in secure context (must be https), unable to connect to Ledger.<br/>https://github.com/LedgerHQ/ledger-node-js-api/issues/32";
	else if (error.errorCode === 4)
		errorText =
			"Error code = 4. Vpub app is not open on Ledger. Please open the Vpub app with <b>Browser support</b> enabled to continue.";
	else if (error.errorCode === 5)
		errorText = "Error code = 5 (timed out). Unable to receive an answer from Ledger Hardware. Please check the screen on your device and try again.<br/>" +
			"Is your Ledger unlocked and is the <b>Vpub</b> app open with <b>Browser support</b> enabled in Settings?";
	else if (error.errorCode === 400)
		errorText =
			"Error code = 400. Please update your hardware device, seems like an error occurred while updating. https://ledger.zendesk.com/hc/en-us/articles/115005171225-Error-Code-400";
	return errorText;
}

var trezorVpub;
function unlockTrezor(showResponse) {
	disableAutoConnect();
	if (showResponse) {
		document.getElementById("response").style.display = "block";
		document.getElementById("response").innerHTML =
			"Connecting to TREZOR Hardware Wallet .. Please follow the instructions in the popup window!";
	}
    //TrezorConnect.setCurrency("Vpub");
    TrezorConnect.setCurrency("Dash");
	TrezorConnect.setCurrencyUnits("mDASH");
	TrezorConnect.getAccountInfo("m/44'/5'/0'", function (response) {
        if (response.success) {
            
			trezorVpub = response;
			
			console.log('Account ID: ', response.id);
			console.log('Account path: ', response.path);
			console.log('Serialized account path: ', response.serializedPath);
			console.log('Xpub', response.xpub);
			console.log('Fresh address (first unused address): ', response.freshAddress);
			console.log('Fresh address ID: ', response.freshAddressId);
			console.log('Fresh address path: ', response.freshAddressPath);
			console.log('Serialized fresh address path: ', response.serializedFreshAddressPath);
			console.log('Balance in satoshis (including unconfirmed):', response.balance);
			console.log('Balance in satoshis (only confirmed):', response.confirmed);
			
			goToSendPanel(
				"Successfully connected to TREZOR Hardware Wallet, you can now confirm all features on this site with your device.");


            $.get("https://www.vpubchain.net/abe/chain/Vpub/q/addressbalance/" + response.freshAddress,
                function (data, status) {
                    if (status === "success" && data !== "ERROR: address invalid") {
                        //console.log("Updating balance of " + vpubKeystoreWallet.address + ": " + data);
                        addressBalances[response.freshAddress] = parseFloat(data);
                        updateLocalStorageBalancesAndRefreshTotalAmountAndReceivingAddresses();
                        autoBalanceCheck = window.setInterval(tryBalanceCheck, 1000);
                    }
                });

            //addressBalances = { addressIndex: response.freshAddressId, address: response.freshAddress };

            //var totalAmount = response.balance / 100000000.0;
            //var totalAmount = response.balance;
			//document.getElementById("totalAmountVpub").innerHTML = showNumber(totalAmount, 8);
			//document.getElementById("totalAmountMVpub").innerHTML = showNumber(totalAmount * 1000, 5);
			//document.getElementById("totalAmountUsd").innerHTML = showNumber(totalAmount * usdRate, 2);
			//document.getElementById("totalAmountEur").innerHTML = showNumber(totalAmount * eurRate, 2);
			var list = $("#addressList");
			list.empty();
			var address = response.freshAddress;
            var qrImg = "//api.qrserver.com/v1/create-qr-code/?size=240x240&data=vpub:" + address;
            $("<li><a href='https://www.vpubchain.net/abe/address/" +
				address + "' target='_blank' rel='noopener noreferrer'>" +
				"<img width='140' height='140' src='" + qrImg +
					"' title='Your freshest Vpub Address should be used for receiving Vpub, you will get a new one once this has been used!' /><br/>" + address +
				"</a><div class='address-amount' onclick='setAmountToSend("+0+")'>" +
				showVpubOrMVpubNumber(0) + "</div></li>").prependTo(list);
			//allow anyway: Currently not supported on TREZOR $("#useInstantSend").disable()
		} else {
			document.getElementById("response").innerHTML = "Error getting TREZOR account: "+ response.error;
		}
	});
}

function setTotalAmountToSend() {
	setAmountToSend(parseFloat($("#totalAmountVpub").text()));
}

function setAmountToSend(amount) {
	var sendCurrency = $("#selectedSendCurrency").text();
	// We have to do the inverse as below to convert from Vpub to the selected format!
	if (sendCurrency === "mVP")
		amount *= 1000;
	if (sendCurrency === "USD")
		amount *= usdRate;
	if (sendCurrency === "EUR")
		amount *= eurRate;
	$("#amount").val(amount);
	updateAmountInfo();
}

var amountToSend = 0.001;
function getPrivateSendNumberOfInputsBasedOnAmount() {
	// Everything below 10mVPUB will be send in one transaction.
	// Amounts are: 10mVPUB, 100mVPUB, 1 VP, 10 VP
	// https://vpubpay.atlassian.net/wiki/spaces/DOC/pages/1146924/PrivateSend
	if (amountToSend <= 0.01)
		return 1;
	var numberOfPrivateSendInputsNeeded = 1;
	var checkAmountToSend = amountToSend;
	while (checkAmountToSend > 10) {
		numberOfPrivateSendInputsNeeded++;
		checkAmountToSend -= 10;
	}
	while (checkAmountToSend > 1) {
		numberOfPrivateSendInputsNeeded++;
		checkAmountToSend -= 1;
	}
	while (checkAmountToSend > 0.1) {
		numberOfPrivateSendInputsNeeded++;
		checkAmountToSend -= 0.1;
	}
	while (checkAmountToSend > 0.01) {
		numberOfPrivateSendInputsNeeded++;
		checkAmountToSend -= 0.01;
	}
	return numberOfPrivateSendInputsNeeded;
}

var lastKnownNumberOfInputs = 1;
function updateTxFee(numberOfInputs) {
	if (numberOfInputs <= 0) {
		// Try to figure out how many inputs we would need if we have multiple addresses
		numberOfInputs = 0;
		var amountToCheck = amountToSend;
		$.each(addressBalances, function(key, amount) {
			if (amount > 0 && amountToCheck > 0.00000001) {
				numberOfInputs++;
				amountToCheck -= amount;
			}
		});
		if (numberOfInputs === 0)
			numberOfInputs = lastKnownNumberOfInputs;
	}
	lastKnownNumberOfInputs = numberOfInputs;
	// mVP tx fee with 1 duff/byte with default 226 byte tx for 1 input, 374 for 2 inputs (78+148*
	// inputs). All this is recalculated below and on the server side once number of inputs is known.
	var txFee = 0.00078 + 0.00148 * numberOfInputs;
	if ($("#useInstantSend").is(':checked'))
		txFee = 0.1 * numberOfInputs;
	// PrivateSend number of needed inputs depends on the amount, not on the inputs (fee for that
	// is already calculated above). Details on the /AboutPrivateSend help page
	if ($("#usePrivateSend").is(':checked'))
		txFee += 0.25 + 0.05 * getPrivateSendNumberOfInputsBasedOnAmount();
	$("#txFeeMVpub").text(showNumber(txFee, 5));
	$("#txFeeUsd").text(showNumber(txFee * usdRate / 1000, 4));
	if (amountToSend < DUST_AMOUNT_IN_VPUB || amountToSend > parseFloat($("#totalAmountVpub").text()) ||
		$("#usePrivateSend").is(':checked') && amountToSend < MinimumForPrivateSend) {
		$("#generateButton").css("backgroundColor", "gray").attr("disabled", "disabled");
		amountToSend = 0;
	}
}
updateTxFee(1);

function setSendCurrency(newSendCurrency) {
	$("#selectedSendCurrency").text(newSendCurrency);
	updateAmountInfo();
}
function getChannel() {
	return $("#sendToEmail").is(":checked")
		? "Email"
		: $("#sendToTwitter").is(":checked")
		? "Twitter"
		: $("#sendToReddit").is(":checked")
		? "Reddit"
		: $("#sendToDiscord").is(":checked")
		? "Discord"
		: "Address";
}
function getChannelAddress() {
	return $("#sendToEmail").is(":checked")
		? $("#toEmail").val()
		: $("#sendToTwitter").is(":checked")
		? $("#toTwitter").val()
		: $("#sendToReddit").is(":checked")
		? $("#toReddit").val()
		: $("#sendToDiscord").is(":checked")
		? $("#toDiscord").val()
		: $("#toAddress").val();
}
function getChannelExtraText() {
	return $("#sendToEmail").is(":checked")
		? $("#toEmailExtraText").val()
		: $("#sendToTwitter").is(":checked")
		? $("#toTwitterExtraText").val()
		: $("#sendToReddit").is(":checked")
		? $("#toRedditExtraText").val()
		: $("#sendToDiscord").is(":checked")
		? $("#toDiscordExtraText").val()
		: "";
}
function isValidEmail(email) {
	var re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
	return re.test(email);
}
function isValidTwitterUsername(username) {
	return /^@[a-zA-Z0-9_]{1,15}$/.test(username);
}
function isValidDiscordUsername(username) {
	return /^@(.*)#[0-9]{4}$/.test(username);
}
function isValidRedditUsername(username) {
	return username.startsWith('/u/') && username.length > 4 && username.indexOf(' ') < 0;
}
function isValidSendTo() {
	var channel = getChannel();
	var sendTo = getChannelAddress();
	if (channel === "Address")
		return isValidVpubAddress(sendTo);
	else if (channel === "Email")
		return isValidEmail(sendTo);
	else if (channel === "Twitter")
		return isValidTwitterUsername(sendTo);
	else if (channel === "Discord")
		return isValidDiscordUsername(sendTo);
	else if (channel === "Reddit")
		return isValidRedditUsername(sendTo);
	return false;
}
// Doesn't make much sense to send less than 1 mVP for PrivateSend (as fees will be >25%)
var MinimumForPrivateSend = 0.001;
function updateAmountInfo() {
	var amount = parseFloat($("#amount").val());
	var amountIsValid = amount > 0;
	if (isNaN(amount))
		amount = 1;
	var sendCurrency = $("#selectedSendCurrency").text();
	if (sendCurrency === "mVP")
		amount /= 1000;
	if (sendCurrency === "USD")
		amount /= usdRate;
	if (sendCurrency === "EUR")
		amount /= eurRate;
	amountToSend = amount;
	if (amountToSend < DUST_AMOUNT_IN_VPUB || amountToSend > parseFloat($("#totalAmountVpub").text()) ||
		$("#usePrivateSend").is(':checked') && amountToSend < MinimumForPrivateSend)
		amountIsValid = false;
	//not longer used or shown: var btcValue = showNumber(amountToSend * btcRate, 6);
    $("#amount-info-box").text(""
  //      showNumber(amountToSend * 1000, 5) + " mVP " +
  //      "= " + showNumber(amountToSend, 8) + " VP " +
		//"= $" + showNumber(amountToSend * usdRate, 2) + " " +
  //      "= €" + showNumber(amountToSend * eurRate, 2) + " (1 VP = " + btcRate + " BTC)"
    );
	updateTxFee(0);
	if (amountIsValid && isValidSendTo()) {
		$("#generateButton").css("backgroundColor", "#1c75bc").removeAttr("disabled");
	} else {
		$("#generateButton").css("backgroundColor", "gray").attr("disabled", "disabled");
		amountToSend = 0;
	}
}
updateAmountInfo();

function copyToClipboard(element) {
	var $temp = $("<input>");
	$("body").append($temp);
	$temp.val($(element).text() === "" ? element : $(element).text()).select();
	document.execCommand("copy");
	$temp.remove();
	if (element === "XoASepVfo1cegWp52HS9gbcKuarLyqxsKT" && $("#toAddress").val() === "") {
		$("#toAddress").val(element);
		updateAmountInfo();
	}
}

function generateTransaction() {
	$("#generateButton").css("background-color", "gray").attr("disabled", "disabled");
	if (amountToSend === 0) {
		$("#transactionPanel").hide();
		$("#resultPanel").css("color", "red")
			.text(($("#usePrivateSend").is(':checked') && parseFloat($("#amount").val()) < 1 ?
				"PrivateSend transactions should be done with at least 1mVPUB! " : "")+
				"Please enter an amount you have and a valid address to send to. Unable to create transaction!");
		return;
	}
	// Okay, we have all data ready, pick the oldest addresses until we have the required amount and
	// find all unspend outputs and send it all to the MyVpubWallet server to prepare the raw
	// transaction to sign. Doing this locally is possible too, but too much work right now.
	$("#resultPanel").css("color","black").text("Waiting for raw transaction to be generated ...");
	if (trezorVpub)
		generateTrezorSignedTx();
	else
		addNextAddressWithUnspendFundsToRawTx(getAddressesWithUnspendFunds(), 0, getFreshestAddress(), 0, [], [], [], "");
}
function generateTrezorSignedTx() {
	//all this get address/utxo stuff is not required on Trezor, we can simply use (however without InstantSend support, maybe the user can select 10000duff fee (10mVPUB) to allow InstantSend):
	var channel = getChannel();
	var sendTo = getChannelAddress();
	var txFee = parseFloat($("#txFeeMVpub").text()) / 1000;
	// Minimum fee we need to use for sending is 0.1mVPUB, otherwise trezor reports:
	// Account funds are insufficient. Retrying...
	if (txFee < 0.1 / 1000) {
		txFee = 0.1 / 1000;
		$("#extraTxNotes").text(
			"TREZOR requires currently to have at least 0.1mVPUB for fees, even if you choose lower ones when actually sending. ");
	}
	var maxAmountPossible = parseFloat($("#totalAmountVpub").text());
	// If we send everything, subtract txFee so we can actually send everything
	if (amountToSend+txFee >= maxAmountPossible)
		amountToSend = maxAmountPossible - txFee;
	var outputs = [
		{
			address: sendTo,
			amount: Math.round(amountToSend * 100000000) //in duff
		}
	];
	$("#transactionPanel").show();
	$("#txDetailsPanel").hide();
	// InstantSend is not really supported on TREZOR, but if we set the fee correctly and send with
	// our MyVpubWallet service, it still will work out of the box. PrivateSend is deferred anyway.
	var useInstantSend = $("#useInstantSend").is(':checked');
	var usePrivateSend = $("#usePrivateSend").is(':checked');
	if (usePrivateSend || channel !== "Address") {
		// PrivateSend needs to generate the raw tx just to get the new privatesend address
		var utxosTextWithOutputIndices = "0";
		var remainingVpub = 0;
		var remainingAddress = getFreshestAddress();
		$.getJSON("/GenerateRawTx?utxos="+utxosTextWithOutputIndices+"&channel="+channel+"&amount="+showNumber(amountToSend, 8)+"&sendTo="+sendTo.replace('#','|')+"&remainingAmount="+showNumber(remainingVpub, 8)+"&remainingAddress="+remainingAddress+"&instantSend="+useInstantSend+"&privateSend="+usePrivateSend+"&extraText="+getChannelExtraText()).done(
			function (data) {
				txFee = data["usedSendTxFee"];
				var rawTxList = showRawTxPanel(sendTo, txFee,
					data["redirectedPrivateSendAddress"],
					data["redirectedPrivateSendAmount"]);
				outputs = [
					{
						address: data["redirectedPrivateSendAddress"],
						amount: Math.round(data["redirectedPrivateSendAmount"] * 100000000) //in duff
					}
				];
				if (usePrivateSend)
				$("<li>Please confirm this PrivateSend transaction on your TREZOR hardware device (make sure the PrivateSend target address "+data["redirectedPrivateSendAddress"]+" matches what you see on the screen), use <b>economy</b> fees!</li>").appendTo(rawTxList);
				TrezorConnect.composeAndSignTx(outputs, function (result) {
					if (result.success) {
						$("#transactionPanel").hide();
						$("#txDetailsPanel").show();
						$("#txDetailsPanel").html("点击查看详细交易信息.");
						signedTx = result.serialized_tx;
						//console.log("signed tx %O", signedTx);
						$("#resultPanel").css("color", "black").text("Sending signed transaction to the Vpub network ..");
						$.get("/SendSignedTx?signedTx=" + signedTx + "&instantSend=" + useInstantSend).done(
							function (finalTx) {
								$("#resultPanel").css("color", "orange").html(
									"成功创建签名交易，并发送至维公链网络，"+
									"交易需要花费数分钟时间，您随时点击以下链接查看交易是否被打包发布: <a href='https://www.vpubchain.net/abe/tx/" + finalTx+"' target='_blank' rel='noopener noreferrer'>"+finalTx+"</a>"+(usePrivateSend?getPrivateSendFinalHelp() : ""));
							}).fail(function (jqxhr) {
								$("#resultPanel").css("color", "red").text("Server Error: " + jqxhr.responseText);
							});
					} else {
						$("#resultPanel").css("color","red").text("Error signing with TREZOR: " + result.error+
							(result.error === "Amount is to low" ? " (Sorry, TREZOR currently only allows transactions above 5000 duffs, use more than 0.05 mVP)":""));
					}
				});
			}).fail(function (jqxhr) {
				$("#resultPanel").css("color", "red").text("Server Error: " + jqxhr.responseText);
			});
		return;
	}
	var rawTxList = showRawTxPanel(sendTo, txFee, sendTo, 1);
	if (useInstantSend)
		$("<li>Please confirm this transaction on your TREZOR hardware device. Since you have selected InstantSend, it will only go through if you manually set the fee to 10000 duffs (0.1mVPUB)!</li>").appendTo(rawTxList);
	else
		$("<li>Please confirm this transaction on your TREZOR hardware device, use <b>economy</b> fees!</li>").appendTo(rawTxList);
	TrezorConnect.composeAndSignTx(outputs, function (result) {
		if (result.success) {
			$("#transactionPanel").hide();
			$("#txDetailsPanel").show();
			$("#txDetailsPanel").html("点击查看交易详细信息。");
			signedTx = result.serialized_tx;
			//console.log("signed tx %O", signedTx);
			$("#resultPanel").css("color", "black").text("正在将交易签名发布..");
			$.get("/SendSignedTx?signedTx=" + signedTx + "&instantSend=" + useInstantSend).done(
				function (finalTx) {
					$("#resultPanel").css("color", "orange").html(
						"成功将交易信息打包发布至维公链网络。 "+
						(useInstantSend ? "You used InstantSend, the Vpub will appear immediately at the target wallet. " : "")+
						"交易需要花费数分钟，您可以点击以下链接随时查看交易是否完成: <a href='https://www.vpubchain.net/abe/tx/" + finalTx+"' target='_blank' rel='noopener noreferrer'>"+finalTx+"</a>");
				}).fail(function (jqxhr) {
					$("#resultPanel").css("color", "red").text("Server Error: " + jqxhr.responseText);
				});
		} else {
			$("#resultPanel").css("color","red").text("Error signing with TREZOR: " + result.error+
				(result.error === "Amount is to low" ? " (Sorry, TREZOR currently only allows transactions above 5000 duffs, use more than 0.05 mVP)":""));
		}
	});
}

var rawTx = "";
var signedTx = "";
function addNextAddressWithUnspendFundsToRawTx(addressesWithUnspendInputs, addressesWithUnspendInputsIndex, remainingAddress, txAmountTotal, txToUse, txOutputIndexToUse, txAddressPathIndices, inputListText) {
	if (addressesWithUnspendInputsIndex >= addressesWithUnspendInputs.length) {
		$("#resultPanel").css("color", "red")
			.text("Failed to find more addresses with funds for creating transaction. Unable to continue!");
		return;
	}
	//Find utxo, via undocumented https://www.vpubchain.net/abe/chain/Vpub/unspent/<address>
	//another option: https://github.com/UdjinM6/insight-api-vpub#unspent-outputs
    $.getJSON("https://www.vpubchain.net/abe/chain/Vpub/unspent/" +
		addressesWithUnspendInputs[addressesWithUnspendInputsIndex].address,
		function (data, status) {
			var address = addressesWithUnspendInputs[addressesWithUnspendInputsIndex].address;
			if (status !== "success" || data === "Error getting unspent outputs" || !data["unspent_outputs"]) {
				$("#resultPanel").css("color", "red")
					.text("Failed to find any utxo (unspend transaction output) for " + address + ". Was it just spend elsewhere? Unable to create transaction, please refresh page!");
				return;
			}
			//Return format:
			//{ 
			//"unspent_outputs": [
			//	{
			//		"block_number": 732794,
			//		"script": "76a91403d6fdba65010ec83202ec142a2807d9019b3e6d88ac",
			//		"tx_hash": "dcffdac068fef91f81b9eacd3b2719405d9eacc0353bc00c7f1bc3de94f49c84",
			//		"tx_output_n": 1,
			//		"value": 100000000,
			//		"value_hex": "5f5e100"
			//	}
			// ]
			//}
			var utxos = data["unspent_outputs"];
			var thisAddressAmountToUse = 0;
			var txFee = parseFloat($("#txFeeMVpub").text()) / 1000;
            var totalAmountNeeded = amountToSend + txFee;
            console.log("txFee:" + txFee);
            console.log("amountToSend:" + amountToSend);
            console.log("totalAmountNeeded:" + totalAmountNeeded);
			var maxAmountPossible = parseFloat($("#totalAmountVpub").text());
			// If we send everything, subtract txFee so we can actually send everything
			if (totalAmountNeeded >= maxAmountPossible)
				totalAmountNeeded = maxAmountPossible;
			for (var i = 0; i < utxos.length; i++) {
				var amount = utxos[i]["value"] / 100000000.0;
				if (amount >= DUST_AMOUNT_IN_VPUB) {
					txToUse.push(utxos[i]["tx_hash"]);
					txOutputIndexToUse.push(utxos[i]["tx_output_n"]);
					txAddressPathIndices.push(addressesWithUnspendInputs[addressesWithUnspendInputsIndex].addressIndex);
					thisAddressAmountToUse += amount;
					txAmountTotal += amount;
					if (txAmountTotal >= totalAmountNeeded)
						break;
				}
			}
            inputListText += "<li><a href='https://www.vpubchain.net/abe/address/" + address + "' target='_blank' rel='noopener noreferrer'><b>" + address + "</b></a> (-" + showVpubOrMVpubNumber(thisAddressAmountToUse) + ")</li>";
            
            if (txAmountTotal >= totalAmountNeeded) {
				// Recalculate txFee like code above, now we know the actual number of inputs needed
				updateTxFee(txToUse.length);
				txFee = parseFloat($("#txFeeMVpub").text()) / 1000;
				totalAmountNeeded = amountToSend + txFee;
				if (totalAmountNeeded >= maxAmountPossible)
                    totalAmountNeeded = maxAmountPossible;
                console.log("txAmountTotal:" + txAmountTotal);
                console.log("totalAmountNeeded:" + totalAmountNeeded);
				// Extra check if we are still have enough inputs to what we need
				if (txAmountTotal >= totalAmountNeeded) {
					// We have all the inputs we need, we can now create the raw tx
					$("#transactionPanel").show();
					//debug: inputListText += "<li>Done, got all inputs we need:</li>";
					var utxosTextWithOutputIndices = "";
					for (var index = 0; index < txToUse.length; index++) {
						//debug: inputListText += "<li>"+txToUse[index]+", "+txOutputIndexToUse[index]+"</li>";
						utxosTextWithOutputIndices += txToUse[index] + "|" + txOutputIndexToUse[index] + "|";
					}
					var channel = getChannel();
					var sendTo = getChannelAddress();
					var useInstantSend = $("#useInstantSend").is(':checked');
					var usePrivateSend = $("#usePrivateSend").is(':checked');
					$("#rawTransactionData").empty();
					$("#txDetailsPanel").show();
					$("#txDetailsPanel").html("Click to show transaction details for techies.");
					// Finish raw tx to sign, one final check if everything is in order will be done on server!
					if (!ledgerVpub)
						$("#signButton").show();
					// Update amountToSend in case we had to reduce it a bit to allow for the txFee
					amountToSend = totalAmountNeeded - txFee;
					var remainingVpub = txAmountTotal - totalAmountNeeded;
					$.getJSON("/GenerateRawTx?utxos=" + utxosTextWithOutputIndices + "&channel=" + channel + "&amount=" + showNumber(amountToSend, 8) + "&sendTo=" + sendTo.replace('#', '|')+"&remainingAmount="+showNumber(remainingVpub, 8)+"&remainingAddress="+remainingAddress+"&instantSend="+useInstantSend+"&privateSend="+usePrivateSend+"&extraText="+getChannelExtraText()).done(
					function (data) {
						var txHashes = data["txHashes"];
						rawTx = data["rawTx"];
						txFee = data["usedSendTxFee"];
						//console.log("txHashes: %O", txHashes);
						//console.log("rawTx: %O", rawTx);
						var rawTxList = showRawTxPanel(sendTo, txFee,
							data["redirectedPrivateSendAddress"],
							data["redirectedPrivateSendAmount"]);
						$("<li>Using these inputs from your addresses for the required <b>" + showVpubOrMVpubNumber(totalAmountNeeded) + "</b> (including fees):<ol>" + inputListText + "</ol></li>").appendTo(rawTxList);
						if (remainingVpub > 0)
                            $("<li>The remaining " + showVpubOrMVpubNumber(remainingVpub) +" will be send to your own receiving address: <a href='https://www.vpubchain.net/abe/address/" + remainingAddress + "' target='_blank' rel='noopener noreferrer'><b>" + remainingAddress + "</b></a></li>").appendTo(rawTxList);
						if (ledgerVpub)
							signRawTxOnLedgerHardware(txHashes, rawTx, txOutputIndexToUse, txAddressPathIndices);
						else
							signRawTxWithKeystore(txHashes, txOutputIndexToUse, rawTx, txFee);
					}).fail(function (jqxhr) {
						$("#resultPanel").css("color", "red").text("Server Error: " + jqxhr.responseText);
					});
					return;
				}
			}
			// Not done yet, get next address
            addressesWithUnspendInputsIndex++;
            console.log("addressesWithUnspendInputsIndex:" + addressesWithUnspendInputsIndex);
            console.log("addressesWithUnspendInputs.length:" + addressesWithUnspendInputs.length);
            console.log(addressesWithUnspendInputs);
			if (addressesWithUnspendInputsIndex < addressesWithUnspendInputs.length)
				addNextAddressWithUnspendFundsToRawTx(addressesWithUnspendInputs,
					addressesWithUnspendInputsIndex,
					remainingAddress,
					txAmountTotal,
					txToUse,
					txOutputIndexToUse,
					txAddressPathIndices,
					inputListText);
            else {
				$("#transactionPanel").hide();
				$("#resultPanel").css("color", "red").text("Insufficient funds, cannot send " +
					totalAmountNeeded + " Vpub (including tx fee), you only have " + maxAmountPossible +
					" Vpub. If you have Vpub incoming, please wait until they are fully confirmed and show up on your account balance here. Unable to create transaction!");
			}
		});
}

function signRawTxOnLedgerHardware(txHashes, rawTx, txOutputIndexToUse, txAddressPathIndices) {
	var txs = [];
	var addressPaths = [];
	for (var i = 0; i < txHashes.length; i++) {
		var parsedTx = ledgerVpub.splitTransaction(txHashes[i]);
		//console.log("parsed tx " + i + ": %O", parsedTx);
		if (!parsedTx.inputs || parsedTx.inputs.length === 0) {
			$("#resultPanel").css("color", "red")
				.text("Empty broken raw tx for input " + i + ", unable to continue");
			return;
		}
		txs.push([parsedTx, txOutputIndexToUse[i]]);
		if (!txAddressPathIndices[i]) {
			$("#resultPanel").css("color", "red")
				.text("Empty broken address path index for input " + i + ", unable to continue");
			return;
		}
		addressPaths.push("44'/5'/0'/0/" + txAddressPathIndices[i]);
	}
	var parsedRawtx = ledgerVpub.splitTransaction(rawTx);
	//console.log("parsedRawtx: %O", parsedRawtx);
	if (!parsedRawtx || parsedRawtx.outputs.length === 0) {
		$("#resultPanel").css("color", "red").text("Empty broken raw tx outputs, unable to continue");
		return;
	}
	var outputScript = ledgerVpub.serializeTransactionOutputs(parsedRawtx).toString('hex');
	//console.log("outputScript: %O", outputScript);
	if (!outputScript) {
		$("#resultPanel").css("color", "red").text("Empty broken raw tx output script, unable to continue");
		return;
	}
	$("#resultPanel").css("color", "orange").html("Sign the transaction <b>output#1</b> and <b>fee</b> with your hardware device to send it to the Vpub network!");
	// Sign on hardware (specifying the change address gets rid of change output confirmation)
	// Still requires 2 confirmation, first the external output address and then the transaction+fee
	var remainingAddressPath = "44'/5'/0'/0/" + (getNumberOfAddresses() - 1);
	//console.log("remainingAddressPath: "+remainingAddressPath);
	ledgerVpub.EXTENSION_TIMEOUT_SEC = 90;
	ledgerVpub.createPaymentTransactionNew_async(txs, addressPaths, remainingAddressPath,
		outputScript).then(
		function (finalSignedTx) {
			signedTx = finalSignedTx;
			//console.log("signed tx %O", signedTx);
			signAndSendTransaction();
		}).catch(function (error) {
			$("#resultPanel").css("color", "red").html(getLedgerErrorText(error));
		});
}

function signRawTxWithKeystore(txHashes, txOutputIndexToUse, rawTx, txFee) {
	//console.log("rawTx %O", rawTx);
	var txFeeInDuffs = Math.round(txFee * 100000000);
	//console.log("txFeeInDuffs %O", txFeeInDuffs);
	signedTx = window.signRawTx(txHashes, txOutputIndexToUse, rawTx, txFeeInDuffs, CryptoJS.AES.decrypt(vpubKeystoreWallet.d, vpubKeystoreWallet.s).toString(CryptoJS.enc.Utf8));
	//console.log("signed tx %O", signedTx);
	if (signedTx.startsWith("Error")) {
		$("#resultPanel").css("color", "red").text("Signing Transaction failed. " + signedTx);
		return;
	}
	$("#signButton").css("backgroundColor", "#1c75bc").removeAttr("disabled");
	$("#resultPanel").css("color", "black").text("Successfully generated and signed transaction with your Keystore wallet! You can now send it out.");
}

function signAndSendTransaction() {
	if (!signedTx || signedTx === "" || signedTx.startsWith("Error"))
		return;
	$("#signButton").hide().css("backgroundColor", "gray").attr("disabled", "disabled");
	$("#transactionPanel").hide();
	var useInstantSend = $("#useInstantSend").is(':checked');
	var usePrivateSend = $("#usePrivateSend").is(':checked');
	$("#resultPanel").css("color", "black").text("正在进行交易签名打包 ..");
	$.get("/SendSignedTx?signedTx=" + signedTx + "&instantSend=" + useInstantSend).done(
	function (finalTx) {
		$("#resultPanel").css("color", "orange").html(
			"成功完成交易打包并发布至维公链网络。 "+
			(useInstantSend ? "You used InstantSend, the target wallet will immediately see incoming Vpub." : "")+
			"交易需花费数分钟时间，您可以点击以下链接随时查看交易是否完成: <a href='https://www.vpubchain.net/abe/tx/" + finalTx+"' target='_blank' rel='noopener noreferrer'>"+finalTx+"</a>"+(usePrivateSend?getPrivateSendFinalHelp() : ""));
	}).fail(function (jqxhr) {
		$("#resultPanel").css("color", "red").text("Server Error: " + jqxhr.responseText);
	});
}

function getPrivateSendFinalHelp() {
	return "<br /><br/>PrivateSend transactions require mixing. Usually small amounts are available right away and will arrive on the given target address anonymously in a few minutes, but it could also take a few hours. Please be patient, if you still can't see the Vpub arriving a day later please <a href='mailto:Support@MyVpubWallet.org'>contact support</a> with all data listed here.";
}

function showRawTxPanel(toAddress, txFee, privateSendAddress, redirectedPrivateSendAmount) {
	var rawTxList = $("#rawTransactionData");
	rawTxList.empty();
	var useInstantSend = $("#useInstantSend").is(':checked');
	var usePrivateSend = $("#usePrivateSend").is(':checked');
	if (usePrivateSend && toAddress !== privateSendAddress)
        $("<li>Sending <b>" + showVpubOrMVpubNumber(redirectedPrivateSendAmount) + "</b> (with PrivateSend tx fees) to new autogenerated PrivateSend address <a href='https://www.vpubchain.net/abe/address/" + privateSendAddress + "' target='_blank' rel='noopener noreferrer'><b>" + privateSendAddress + "</b></a>. When mixing is done (between right away and a few hours) <b>" + showVpubOrMVpubNumber(amountToSend) + "</b> will anonymously arrive at: <a href='https://explorer.vpub.org/address/" + toAddress + "' target='_blank' rel='noopener noreferrer'><b>" + toAddress + "</b></a></li>").appendTo(rawTxList);
	else if (toAddress !== privateSendAddress)
        $("<li>Sending <b>" + showVpubOrMVpubNumber(amountToSend) + "</b> to " + getChannel() + ": " + toAddress +" via <a href='https://www.vpubchain.net/abe/address/" + privateSendAddress + "' target='_blank' rel='noopener noreferrer'><b>" + privateSendAddress + "</b></a></li>").appendTo(rawTxList);
	else
        $("<li>Sending <b>" + showVpubOrMVpubNumber(amountToSend) + "</b> to <a href='https://www.vpubchain.net/abe/address/" + toAddress + "' target='_blank' rel='noopener noreferrer'><b>" + toAddress + "</b></a></li>").appendTo(rawTxList);
	$("<li>InstantSend: <b>" + (useInstantSend ? "Yes" : "No") + "</b>, PrivateSend: <b>" + (usePrivateSend ? "Yes" : "No") + "</b>, Tx fee"+(usePrivateSend?" (for initial send to mix)":"")+": <b>" + showVpubOrMVpubNumber(txFee) + "</b> ($" + showNumber(txFee * usdRate, 4) + ")</li>").appendTo(rawTxList);
	return rawTxList;
}

function showTxDetails() {
	$("#txDetailsPanel").prop('onclick',null).off('click');
	$("#txDetailsPanel").html(
		(rawTx !== "" ? "Confirm raw tx with any Vpub node in the debug console:<br />decoderawtransaction " + rawTx + "<br />" : "") +
		(signedTx !== "" ? "Signed tx send into the Vpub network: " + signedTx : ""));
	return false;
}

function getAddressesWithUnspendFunds() {
	var addresses = [];
	var addressIndex = 0;
	$.each(addressBalances,
		function(key, amount) {
			if (amount > 0)
				addresses.push({ addressIndex: addressIndex, address: key });
			addressIndex++;
		});
	return addresses;
}

function importKeystoreWallet() {
	$("#createLocalWalletPanel").hide();
	$("#unlockKeystorePanel").hide();
	$("#importKeystoreButton").hide();
	$("#importKeystorePanel").show();
	$("#hardwareWalletsPanel").hide();
}

function loadKeystoreFile() {
	if (!window.FileReader)
		showFailure("FileReader API is not supported by your browser.");
	else if (!$("#keystoreFile")[0].files || !$("#keystoreFile")[0].files[0])
		showFailure("Please select a keystore file!");
	else {
		var file = $("#keystoreFile")[0].files[0];
		var fr = new FileReader();
		fr.onload = function() {
			localStorage.setItem("keystore", fr.result);
			$("#importKeystorePanel").hide();
			$("#createLocalWalletPanel").hide();
			$("#unlockKeystorePanel").show();
			$("#resultPanel").show().css("color", "black").html("Imported your Keystore file into browser.");
		};
		fr.readAsText(file);
	}
}

function importPrivateKey() {
	$("#privateKeyInputPanel").show();
	$("#importPrivateKeyButton").css("background-color", "gray");
}

function importPrivateKeyToKeystore() {
	var key = $("#privateKeyInput").val();
	if (!key || key.length !== 52 && key.length !== 64) {
		$("#createPrivateKeyNotes").text("Invalid private key, it must be exactly 52 or 64 characters long!");
		return;
	}
	$("#privateKeyInputPanel").hide();
	deleteKeystore();
	createKeystoreWallet();
}

function showFailure(errorMessage) {
	$("#response").css("color", "red").html(errorMessage).show();
}

var vpubKeystoreWallet;
function createKeystoreWallet() {
	$("#createKeystoreButton").attr("disabled", "disabled");
	$("#createKeystoreOutput").html("<b>本地钱包已生成</b>,请输入您的钱包密码! 请务必将您的密码保存起来，并且备份钱包文件，如果您丢失密码或者丢失钱包文件，没有人能够将您的钱包找回。");
	$("#createLocalWalletPanel").hide();
	$("#createKeystoreButton").hide();
	$("#hardwareWalletsPanel").hide();
	$("#importingPanel").hide();
	$("#createKeystorePasswordPanel").show();
}

function passwordChanged() {
	var password = $("#keystorePassword").val();
	var passwordRepeated = $("#keystorePasswordRepeated").val();
	if (password.length < 8)
		$("#passwordResult").text("请输入至少8位字符.");
	else if (password.length > 512)
		$("#passwordResult").text("输入的密码超出长度限制");
	else if (password.search(/\d/) === -1 && password.search(/[\!\@\#\$\%\^\&\*\(\)\_\+\.\,\;\:]/) === -1)
		$("#passwordResult").text("请至少输入一个数字或者特殊字符!");
	else if (password.search(/[a-zA-Z]/) === -1)
		$("#passwordResult").text("请至少输入一个小写字母!");
	else if (password !== passwordRepeated)
		$("#passwordResult").text("输入的密码不一致!");
	else {
		$("#passwordResult").html("<b>钱包创建成果</b>,点击下载备份钱包文件，并将其保存在安全的位置!");
		$("#keystorePassword").attr("disabled", "disabled");
		$("#keystorePasswordRepeated").attr("disabled", "disabled");
		$("#generateKeystoreButton").removeAttr("disabled");
	}
}

function download(filename, text) {
	var element = document.createElement('a');
	element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
	element.setAttribute('download', filename);
	element.style.display = 'none';
	document.body.appendChild(element);
	element.click();
	document.body.removeChild(element);
}

function generateKeystoreFile() {
	// Use given private key or create new one if no private key import was done
	var key = $("#privateKeyInput").val();
	if (!key || key.length !== 52 && key.length !== 64)
		key = window.generatePrivateKey();
	else if (key.length === 52)
		key = window.fromWifKey(key).toString();
	$("#createKeystorePasswordPanel").hide();
	var encryptedData = CryptoJS.AES.encrypt(key, $("#keystorePassword").val());
	localStorage.setItem("keystore", encryptedData);
	var currentDate = new Date();
	download("MyVpubWallet"+currentDate.getFullYear()+"-"+(currentDate.getMonth()+1)+"-"+currentDate.getDate()+".KeyStore", encryptedData);
	$("#createLocalWalletPanel").hide();
	$("#importKeystorePanel").hide();
	$("#unlockKeystorePanel").show();
}

function unlockKeystore() {
	try {
		var encryptedData = localStorage.getItem("keystore");
		vpubKeystoreWallet = { d: encryptedData, s: $("#keystorePasswordUnlock").val() };
		vpubKeystoreWallet.address =
			window.getDecryptedAddress(CryptoJS.AES.decrypt(vpubKeystoreWallet.d, vpubKeystoreWallet.s)
				.toString(CryptoJS.enc.Utf8));
		if (!isValidVpubAddress(vpubKeystoreWallet.address))
			showFailure("无效的维公链钱包文件: " + vpubKeystoreWallet.address);
		else {
			goToSendPanel("解锁钱包成功!");
			$("#paperWalletPanel").show();
			generateReceivingAddressList();
            $.get("https://www.vpubchain.net/abe/chain/Vpub/q/addressbalance/" + vpubKeystoreWallet.address,
				function (data, status) {
					if (status === "success" && data !== "ERROR: 地址无效") {
						//console.log("Updating balance of " + vpubKeystoreWallet.address + ": " + data);
						addressBalances[vpubKeystoreWallet.address] = parseFloat(data);
						updateLocalStorageBalancesAndRefreshTotalAmountAndReceivingAddresses();
						autoBalanceCheck = window.setInterval(tryBalanceCheck, 1000);
					}
				});
		}
	} catch (e) {
		showFailure("无法打开本地钱包: " + e);
	}
}

function deleteKeystore() {
	vpubKeystoreWallet = undefined;
	localStorage.removeItem("keystore");
	$("#createLocalWalletPanel").show();
	$("#unlockKeystorePanel").hide();
	$("#importingPanel").show();
	$("#importKeystoreButton").show();
	$("#createKeystoreButton").show();
	$("#importKeystorePanel").show();
	$("#hardwareWalletsPanel").show();
}

function createPaperWallet() {
	if ($("#paperWalletPasswordUnlock").val() !== vpubKeystoreWallet.s) {
		$("#paperWalletError").text("密码无效，无法解锁钱包!");
		return;
	}
	if ($("#paperWalletDetails").is(":visible")) {
		$("#createPaperWalletButton").text("Create PaperWallet");
		$("#paperWalletDetails").hide();
		return;
	}
	$("#createPaperWalletButton").text("Hide PaperWallet");
	$("#paperWalletError").text("");
	var hexa = CryptoJS.AES.decrypt(vpubKeystoreWallet.d, vpubKeystoreWallet.s).toString(CryptoJS.enc.Utf8);
	$("#privateKeyHexa").val(hexa);
	var wif = window.toWifKey(hexa);
	$("#privateKeyWif").val(wif);
    $("#privateKeyQr").attr("src", "//api.qrserver.com/v1/create-qr-code/?size=160x160&data=vpub:" + wif);
	$("#paperWalletDetails").show();
}

function deco(str) {
	var input     = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('');
	var output    = 'NOPQRSTUVWXYZABCDEFGHIJKLMnopqrstuvwxyzabcdefghijklm'.split('');
	var lookup    = input.reduce((m,k,i) => Object.assign(m, {[k]: output[i]}), {});
	return str.split('').map(x => lookup[x] || x).join('');
}