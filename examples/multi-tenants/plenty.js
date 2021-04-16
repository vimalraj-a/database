"use strict";

const _ = require("lodash");
const { ServiceBroker } = require("moleculer");
const DbService = require("../../index").Service;

// Create broker
const broker = new ServiceBroker();

// Create a service
const svc = broker.createService({
	name: "posts",
	mixins: [DbService({ maximumAdapters: 5 })],
	settings: {
		fields: {
			title: { type: "string", required: true },
			content: { type: "string", required: false },
			tenantId: {
				type: "number",
				set: (value, entity, field, ctx) => ctx.meta.tenantId,
				required: true
			}
		},
		scopes: {
			tenant(q, ctx) {
				const tenantId = ctx.meta.tenantId;
				if (!tenantId) throw new Error("Missing tenantId!");

				q.tenantId = ctx.meta.tenantId;
				return q;
			}
		},
		defaultScopes: ["tenant"]
	},
	methods: {
		getAdapterByContext(ctx) {
			const tenantId = ctx.meta.tenantId;
			if (!tenantId) throw new Error("Missing tenantId!");

			return [
				tenantId,
				/*{
					type: "NeDB",
					options: __dirname + `/posts/${_.padStart(tenantId, 4, "0")}.db`
				}*/
				{
					type: "MongoDB",
					options: {
						uri: "mongodb://localhost:27017",
						dbName: `tenant-posts`,
						collection: `posts-${tenantId}`
					}
				}
			];
		}
	},
	async started() {}
});

// Start server
let count = 0;
broker.start().then(async () => {
	setInterval(async () => {
		const tenantId = 1 + Math.floor(Math.random() * 10);

		await broker.call(
			"posts.create",
			{ title: `New post ${++count}` },
			{
				meta: { tenantId }
			}
		);

		console.log("TenantId:", tenantId, " Adapters:", svc.adapters.size);
	}, 2000);
});
