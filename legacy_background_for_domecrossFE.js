const proxy = {
	_authHandler: null,
	_setAuthHandler(authCredentials) {
		//always remove old authHandler
		if (this._authHandler) {
			chrome.webRequest.onAuthRequired.removeListener(this._authHandler);
			this._authHandler = null;
		}
		//return if authCredentials is not valid
		if (!authCredentials || !authCredentials.username || !authCredentials.password) {
			return;
		}
		//add new authHandler if authCredentials is valid
		chrome.webRequest.onAuthRequired.addListener(
			(this._authHandler = function(details) {
				chrome.storage.local.set({ lastAuthRequiredDetail: details });
				if (details.isProxy) {
					chrome.storage.local.set({ lastProxyAuthRequiredDetail: details });
					return { authCredentials };
				}
			}),
			{ urls: ["http://*/*", "https://*/*"] },
			["blocking"]
		);
	},
	isOn: false,
	set({ serverList, username, password }, firstRun) {
		if (this.isOn === null) return;
		this.isOn = null;
		//remember setting
		if (!firstRun) chrome.storage.local.set({ manualStartProxy: false });
		//random select a server
		let server = serverList[Math.floor(Math.random() * serverList.length)];
		Promise.all([
			//turn on proxy
			this._setAuthHandler({ username, password }),
			new Promise(resolve => chrome.proxy.settings.set({ value: { mode: "pac_script", pacScript: { data: `function FindProxyForURL(url,host){var remoteIP=dnsResolve(host);if(isInNet(remoteIP,"127.0.0.0","255.0.0.0")||isInNet(remoteIP,"192.168.0.0","255.255.0.0")||isInNet(remoteIP,"172.16.0.0","255.240.0.0")||isInNet(remoteIP,"10.0.0.0","255.0.0.0"))return"DIRECT";return"${server}";}` } } }, resolve)),
			//update UI to on
			new Promise(resolve => chrome.browserAction.setIcon({ path: "logo_blue.png" }, resolve)),
			new Promise(resolve => chrome.browserAction.setTitle({ title: "Proxy is on." }, resolve))
		]).then(() => (this.isOn = true));
	},
	clear(firstRun) {
		if (this.isOn === null) return;
		this.isOn = null;
		//remember setting
		if (!firstRun) chrome.storage.local.set({ manualStartProxy: true });
		Promise.all([
			//turn off proxy
			this._setAuthHandler(null),
			new Promise(resolve => chrome.proxy.settings.clear({}, resolve)),
			//update UI to off
			new Promise(resolve => chrome.browserAction.setIcon({ path: "logo_red.png" }, resolve)),
			new Promise(resolve => chrome.browserAction.setTitle({ title: "Proxy is off." }, resolve))
		]).then(() => (this.isOn = false));
	}
};

(async function() {
	let currentTime = Math.floor(Date.now() / 1000);
	//try get old config
	let configOld = await new Promise(cb => chrome.storage.local.get(null, cb));
	if (currentTime - configOld.time < 3 * 86400) return configOld;
	//cached proxy setting expired, fetch online proxy setting
	function jerry(s) {
		let r = "";
		for (let e of s.split("|").filter(e => e)) r += "abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ  ;/:'\"!@#$%^&*()1234567890-=+_\\][{}|<>?,./`~"[e];
		return r;
	}
	let configdm = await fetch("https://cfgs.lubotv.com/configdm.js")
		.then(resp => resp.json())
		.then(({ positionc, positionx, positiony }) => ({
			listUrl: jerry(positionc),
			username: jerry(positionx),
			password: jerry(positiony)
		}));
	let list = await fetch(configdm.listUrl)
		.then(resp => resp.json())
		.then(({ serverList }) => {
			let l = [];
			for (let { position } of serverList) {
				let p = jerry(position)
					.replace(/\s+/g, " ")
					.trim();
				if (!l.includes(p)) l.push(p);
			}
			return l;
		});
	//new config
	let configNew = {
		manualStartProxy: !!configOld.manualStartProxy,
		time: currentTime,
		serverList: list,
		username: configdm.username,
		password: configdm.password
	};
	chrome.storage.local.clear();
	chrome.storage.local.set(configNew);
	return configNew;
})()
	.then(({ manualStartProxy, serverList, username, password }) => {
		if (!manualStartProxy) proxy.set({ serverList, username, password }, true);
		else proxy.clear(true);
		return { serverList, username, password };
	})
	.then(config => {
		chrome.browserAction.onClicked.addListener(function() {
			if (proxy.isOn) proxy.clear();
			else proxy.set(config);
		});
	});