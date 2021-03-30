"use strict";

const { ServiceBroker, Context } = require("moleculer");
const { ValidationError } = require("moleculer").Errors;
const DbService = require("../..").Service;

describe("Test validation", () => {
	describe("Test field processing without fields", () => {
		const broker = new ServiceBroker({ logger: false });
		const svc = broker.createService({
			name: "users",
			mixins: [DbService()],
			settings: {}
		});
		const ctx = Context.create(broker, null, {});

		beforeAll(() => broker.start());
		afterAll(() => broker.stop());

		it("check the process fields", async () => {
			expect(svc.$fields).toBeNull();
			expect(svc.$primaryField).toEqual({ name: "_id", columnName: "_id" });
			expect(svc.$softDelete).toBe(false);
		});

		describe("Test validateParams", () => {
			it("should accept valid params", async () => {
				const params = {
					id: 5,
					name: "John",
					age: 42,
					status: true
				};
				const res = await svc.validateParams(ctx, params);
				expect(res).not.toBe(params);
				expect(res).toEqual(params);
			});
		});
	});

	describe("Test fields processing", () => {
		const broker = new ServiceBroker({ logger: false });
		const svc = broker.createService({
			name: "users",
			mixins: [DbService()],
			settings: {
				fields: {
					id: { type: "string", primaryKey: true, columnName: "_id" },
					name: "string",
					age: true,
					password: false,
					createdAt: { type: "date", readonly: true, onCreate: () => new Date() },
					status: {
						type: "string",
						default: "A",
						onRemove: "D"
					}
				}
			}
		});
		const ctx = Context.create(broker, null, {});

		beforeAll(() => broker.start());
		afterAll(() => broker.stop());

		it("check the process fields", async () => {
			expect(svc.$fields).toEqual([
				{
					columnName: "_id",
					name: "id",
					primaryKey: true,
					type: "string",
					required: false
				},
				{ columnName: "name", name: "name", type: "string", required: false },
				{ columnName: "age", name: "age", type: "any", required: false },
				{
					name: "createdAt",
					type: "date",
					columnName: "createdAt",
					onCreate: expect.any(Function),
					readonly: true,
					required: false
				},
				{
					name: "status",
					type: "string",
					columnName: "status",
					default: "A",
					onRemove: "D",
					required: false
				}
			]);
			expect(svc.$primaryField).toEqual({
				name: "id",
				columnName: "_id",
				primaryKey: true,
				type: "string",
				required: false
			});
			expect(svc.$softDelete).toBe(true);
			expect(svc.$shouldAuthorizeFields).toBe(false);
		});

		describe("Test validateParams", () => {
			it("should accept valid params", async () => {
				const params = {};
				const res = await svc.validateParams(ctx, params);
				expect(res).toBeDefined();
			});
		});
	});

	describe("Test fields authority", () => {
		const broker = new ServiceBroker({ logger: false });
		const svc = broker.createService({
			name: "users",
			mixins: [DbService()],
			settings: {
				fields: {
					name: "string",
					password: { type: "string", readPermission: "admin", permission: "owner" },
					email: { type: "string", permission: "moderator" },
					phone: { type: "string", permission: ["admin", "moderator", "owner"] }
				}
			}
		});
		const ctx = Context.create(broker, null, {});

		beforeAll(() => broker.start());
		afterAll(() => broker.stop());

		it("check the process fields", async () => {
			expect(svc.$fields).toEqual([
				{ columnName: "name", name: "name", type: "string", required: false },
				{
					columnName: "password",
					name: "password",
					readPermission: "admin",
					permission: "owner",
					type: "string",
					required: false
				},
				{
					columnName: "email",
					name: "email",
					permission: "moderator",
					type: "string",
					required: false
				},
				{
					columnName: "phone",
					name: "phone",
					permission: ["admin", "moderator", "owner"],
					type: "string",
					required: false
				}
			]);
			expect(svc.$shouldAuthorizeFields).toBe(true);
		});

		describe("Test authorizeFields", () => {
			it("should return all fields", async () => {
				const res = await svc._authorizeFields(svc.$fields, ctx, { a: 5 });
				expect(res).toEqual(svc.$fields);

				const res2 = await svc._authorizeFields(svc.$fields, ctx, { a: 5 }, true);
				expect(res2).toEqual(svc.$fields);
			});

			it("should return fields with read permission", async () => {
				svc.checkAuthority = jest.fn(async () => false);
				const res = await svc._authorizeFields(svc.$fields, ctx, { a: 5 });
				expect(res).toEqual([
					{ columnName: "name", name: "name", type: "string", required: false }
				]);

				expect(svc.checkAuthority).toBeCalledTimes(3);
				expect(svc.checkAuthority).toBeCalledWith(ctx, "admin", { a: 5 }, svc.$fields[1]);
				expect(svc.checkAuthority).toBeCalledWith(
					ctx,
					"moderator",
					{ a: 5 },
					svc.$fields[2]
				);
				expect(svc.checkAuthority).toBeCalledWith(
					ctx,
					["admin", "moderator", "owner"],
					{ a: 5 },
					svc.$fields[3]
				);
			});

			it("should return fields with write permission", async () => {
				svc.checkAuthority = jest.fn(async () => false);
				const res = await svc._authorizeFields(svc.$fields, ctx, { a: 5 }, true);
				expect(res).toEqual([
					{ columnName: "name", name: "name", type: "string", required: false }
				]);

				expect(svc.checkAuthority).toBeCalledTimes(3);
				expect(svc.checkAuthority).toBeCalledWith(ctx, "owner", { a: 5 }, svc.$fields[1]);
				expect(svc.checkAuthority).toBeCalledWith(
					ctx,
					"moderator",
					{ a: 5 },
					svc.$fields[2]
				);
				expect(svc.checkAuthority).toBeCalledWith(
					ctx,
					["admin", "moderator", "owner"],
					{ a: 5 },
					svc.$fields[3]
				);
			});
		});
	});

	describe("Test fields validation at creating", () => {
		const broker = new ServiceBroker({ logger: false });
		const svc = broker.createService({
			name: "users",
			mixins: [DbService()],
			settings: {}
		});
		const ctx = Context.create(broker, null, {});

		beforeAll(() => broker.start());
		afterAll(() => broker.stop());

		describe("Test required, optional, default value", () => {
			beforeAll(() => {
				svc.settings.fields = {
					name: { type: "string", required: true },
					shortName: { type: "string", columnName: "short_name" },
					role: { type: "string", default: "guest" },
					status: { type: "string", required: true, default: "A" }
				};

				svc._processFields();
			});

			it("should accept all params", async () => {
				const params = {
					name: "John",
					shortName: "Joe",
					role: "admin",
					status: "D"
				};
				const res = await svc.validateParams(ctx, params);
				expect(res).toEqual({
					name: "John",
					short_name: "Joe",
					role: "admin",
					status: "D"
				});
			});

			it("should set default params if missing", async () => {
				const params = {
					name: "John"
				};
				const res = await svc.validateParams(ctx, params);
				expect(res).toEqual({
					name: "John",
					role: "guest",
					status: "A"
				});
			});

			it("should throw error if required is missing", async () => {
				const params = {};
				expect.assertions(6);
				try {
					await svc.validateParams(ctx, params);
				} catch (err) {
					expect(err).toBeInstanceOf(ValidationError);
					expect(err.name).toBe("ValidationError");
					expect(err.message).toBe("The field 'name' is required.");
					expect(err.type).toBe("REQUIRED_FIELD");
					expect(err.code).toBe(422);
					expect(err.data).toEqual({
						field: "name",
						value: undefined
					});
				}
			});

			it("should throw error if required is null", async () => {
				const params = {
					name: null
				};
				expect.assertions(6);
				try {
					await svc.validateParams(ctx, params);
				} catch (err) {
					expect(err).toBeInstanceOf(ValidationError);
					expect(err.name).toBe("ValidationError");
					expect(err.message).toBe("The field 'name' is required.");
					expect(err.type).toBe("REQUIRED_FIELD");
					expect(err.code).toBe(422);
					expect(err.data).toEqual({
						field: "name",
						value: null
					});
				}
			});

			it("set nullable", () => {
				svc.settings.fields.name.nullable = true;
				svc._processFields();
			});

			it("should not throw if null & nullable", async () => {
				const params = {
					name: null
				};
				const res = await svc.validateParams(ctx, params);
				expect(res).toEqual({
					name: null,
					role: "guest",
					status: "A"
				});
			});

			it("should throw error if nullable but value is undefined", async () => {
				const params = {};
				expect.assertions(6);
				try {
					await svc.validateParams(ctx, params);
				} catch (err) {
					expect(err).toBeInstanceOf(ValidationError);
					expect(err.name).toBe("ValidationError");
					expect(err.message).toBe("The field 'name' is required.");
					expect(err.type).toBe("REQUIRED_FIELD");
					expect(err.code).toBe(422);
					expect(err.data).toEqual({
						field: "name",
						value: undefined
					});
				}
			});
		});

		describe("Test readonly & immutable", () => {
			beforeAll(() => {
				svc.settings.fields = {
					name: { type: "string", required: true },
					password: { type: "string", readonly: true },
					role: { type: "string", immutable: true }
				};

				svc._processFields();
			});

			it("should remove password field", async () => {
				const params = {
					name: "John",
					password: "pass1234",
					role: "admin"
				};
				const res = await svc.validateParams(ctx, params);
				expect(res).toEqual({
					name: "John",
					role: "admin"
				});
			});

			it("should not touch immutable field if not exist", async () => {
				const params = {
					name: "John",
					password: "pass1234"
				};
				const res = await svc.validateParams(ctx, params);
				expect(res).toEqual({
					name: "John"
				});
			});
		});

		describe("Test hook", () => {
			const onCreate = jest.fn(async () => "Now");
			beforeAll(() => {
				svc.settings.fields = {
					createdAt: { onCreate },
					createdBy: { onCreate: "Owner" },
					updatedAt: { onUpdate: "updated" },
					replacedAt: { onReplace: "replaced" },
					deletedAt: { onRemove: "removed" }
				};

				svc._processFields();
			});

			it("should call hook if value not exists", async () => {
				const params = {};
				const res = await svc.validateParams(ctx, params, { type: "create" });
				expect(res).toEqual({
					createdAt: "Now",
					createdBy: "Owner"
				});

				expect(onCreate).toBeCalledTimes(1);
				expect(onCreate).toBeCalledWith(undefined, {}, ctx);
			});

			it("should call if value exists", async () => {
				onCreate.mockClear();

				const params = {
					createdAt: "2020-09-19",
					createdBy: "John"
				};
				const res = await svc.validateParams(ctx, params);
				expect(res).toEqual({
					createdAt: "Now",
					createdBy: "Owner"
				});

				expect(onCreate).toBeCalledTimes(1);
				expect(onCreate).toBeCalledWith("2020-09-19", params, ctx);
			});
		});

		testTypeConversion(ctx, svc, "create");

		describe("Test custom validation", () => {
			const customValidate = jest.fn(value => (value.length < 3 ? "Too short" : true));
			beforeAll(() => {
				svc.settings.fields = {
					name: { type: "string", required: true, validate: customValidate }
				};

				svc._processFields();
			});

			it("should call custom validate", async () => {
				const params = {
					name: "John Doe"
				};
				const res = await svc.validateParams(ctx, params);
				expect(res).toEqual({
					name: "John Doe"
				});

				expect(customValidate).toBeCalledTimes(1);
				expect(customValidate).toBeCalledWith("John Doe", params, svc.$fields[0], ctx);
			});

			it("should throw error if not valid", async () => {
				const params = {
					name: "Al"
				};
				expect.assertions(6);
				try {
					await svc.validateParams(ctx, params);
				} catch (err) {
					expect(err).toBeInstanceOf(ValidationError);
					expect(err.name).toBe("ValidationError");
					expect(err.message).toBe("Too short");
					expect(err.type).toBe("VALIDATION_ERROR");
					expect(err.code).toBe(422);
					expect(err.data).toEqual({
						field: "name",
						value: "Al"
					});
				}
			});
		});

		describe("Test custom formatter", () => {
			const customSet = jest.fn(v => (v ? v.toUpperCase() : v));
			beforeAll(() => {
				svc.settings.fields = {
					name: { type: "string", set: customSet }
				};

				svc._processFields();
			});

			it("should untouch null values", async () => {
				const params = {
					name: null
				};
				const res = await svc.validateParams(ctx, params);
				expect(res).toEqual({
					name: null
				});

				expect(customSet).toBeCalledTimes(1);
				expect(customSet).toBeCalledWith(null, params, svc.$fields[0], ctx);
			});

			it("should call custom formatter", async () => {
				customSet.mockClear();
				const params = {
					name: "John Doe"
				};
				const res = await svc.validateParams(ctx, params);
				expect(res).toEqual({
					name: "JOHN DOE"
				});

				expect(customSet).toBeCalledTimes(1);
				expect(customSet).toBeCalledWith("John Doe", params, svc.$fields[0], ctx);
			});
		});
	});

	describe("Test fields validation at updating", () => {
		const broker = new ServiceBroker({ logger: false });
		const svc = broker.createService({
			name: "users",
			mixins: [DbService()],
			settings: {}
		});
		const ctx = Context.create(broker, null, {});

		beforeAll(() => broker.start());
		afterAll(() => broker.stop());

		describe("Test required, optional, default value", () => {
			beforeAll(() => {
				svc.settings.fields = {
					name: { type: "string", required: true },
					shortName: { type: "string", columnName: "short_name" },
					role: { type: "string", default: "guest" },
					status: { type: "string", required: true, default: "A" }
				};

				svc._processFields();
			});

			it("should accept all params", async () => {
				const params = {
					name: "John",
					shortName: "Joe",
					role: "admin",
					status: "D"
				};
				const res = await svc.validateParams(ctx, params, { type: "update" });
				expect(res).toEqual({
					name: "John",
					short_name: "Joe",
					role: "admin",
					status: "D"
				});
			});

			it("should not set default params if missing", async () => {
				const params = {
					name: "John"
				};
				const res = await svc.validateParams(ctx, params, { type: "update" });
				expect(res).toEqual({
					name: "John"
				});
			});

			it("should not throw error if required is missing", async () => {
				const params = {};
				const res = await svc.validateParams(ctx, params, { type: "update" });
				expect(res).toEqual({});
			});

			it("should not throw error if required is null", async () => {
				const params = {
					name: null
				};
				const res = await svc.validateParams(ctx, params, { type: "update" });
				expect(res).toEqual({
					name: null
				});
			});

			it("set nullable", () => {
				svc.settings.fields.name.nullable = true;
				svc._processFields();
			});

			it("should not throw if null & nullable", async () => {
				const params = {
					name: null
				};
				const res = await svc.validateParams(ctx, params, { type: "update" });
				expect(res).toEqual({
					name: null
				});
			});

			it("should not throw error if nullable but value is undefined", async () => {
				const params = {};
				const res = await svc.validateParams(ctx, params, { type: "update" });
				expect(res).toEqual({});
			});
		});

		describe("Test readonly & immutable", () => {
			beforeAll(() => {
				svc.settings.fields = {
					name: { type: "string", required: true },
					password: { type: "string", readonly: true },
					role: { type: "string", immutable: true }
				};

				svc._processFields();
			});

			it("should remove password & role fields", async () => {
				const params = {
					name: "John",
					password: "pass1234",
					role: "admin"
				};
				const res = await svc.validateParams(ctx, params, { type: "update" });
				expect(res).toEqual({
					name: "John"
				});
			});

			it("should not touch updateabe field if not exist", async () => {
				const params = {
					name: "John",
					password: "pass1234"
				};
				const res = await svc.validateParams(ctx, params, { type: "update" });
				expect(res).toEqual({
					name: "John"
				});
			});
		});

		testTypeConversion(ctx, svc, "update");

		describe("Test hook", () => {
			const onUpdate = jest.fn(async () => "Now");
			beforeAll(() => {
				svc.settings.fields = {
					createdAt: { onCreate: "Owner" },
					createdBy: { onCreate: "Owner" },
					updatedAt: { onUpdate },
					updatedBy: { onUpdate: "updated" },
					replacedAt: { onReplace: "replaced" },
					deletedAt: { onRemove: "removed" }
				};

				svc._processFields();
			});

			it("should call hook if value not exists", async () => {
				const params = {};
				const res = await svc.validateParams(ctx, params, { type: "update" });
				expect(res).toEqual({
					updatedAt: "Now",
					updatedBy: "updated"
				});

				expect(onUpdate).toBeCalledTimes(1);
				expect(onUpdate).toBeCalledWith(undefined, {}, ctx);
			});

			it("should call if value exists", async () => {
				onUpdate.mockClear();

				const params = {
					updatedAt: "2020-09-19",
					updatedBy: "John"
				};
				const res = await svc.validateParams(ctx, params, { type: "update" });
				expect(res).toEqual({
					updatedAt: "Now",
					updatedBy: "updated"
				});

				expect(onUpdate).toBeCalledTimes(1);
				expect(onUpdate).toBeCalledWith("2020-09-19", params, ctx);
			});
		});

		describe("Test custom validation", () => {
			const customValidate = jest.fn(value => (value.length < 3 ? "Too short" : true));
			beforeAll(() => {
				svc.settings.fields = {
					name: { type: "string", required: true, validate: customValidate }
				};

				svc._processFields();
			});

			it("should call custom validate", async () => {
				const params = {
					name: "John Doe"
				};
				const res = await svc.validateParams(ctx, params, { type: "update" });
				expect(res).toEqual({
					name: "John Doe"
				});

				expect(customValidate).toBeCalledTimes(1);
				expect(customValidate).toBeCalledWith("John Doe", params, svc.$fields[0], ctx);
			});

			it("should throw error if not valid", async () => {
				const params = {
					name: "Al"
				};
				expect.assertions(6);
				try {
					await svc.validateParams(ctx, params, { type: "update" });
				} catch (err) {
					expect(err).toBeInstanceOf(ValidationError);
					expect(err.name).toBe("ValidationError");
					expect(err.message).toBe("Too short");
					expect(err.type).toBe("VALIDATION_ERROR");
					expect(err.code).toBe(422);
					expect(err.data).toEqual({
						field: "name",
						value: "Al"
					});
				}
			});
		});
	});
	describe("Test fields validation at replacing", () => {
		const broker = new ServiceBroker({ logger: false });
		const svc = broker.createService({
			name: "users",
			mixins: [DbService()],
			settings: {}
		});
		const ctx = Context.create(broker, null, {});

		beforeAll(() => broker.start());
		afterAll(() => broker.stop());

		describe("Test required, optional, default value", () => {
			beforeAll(() => {
				svc.settings.fields = {
					name: { type: "string", required: true },
					shortName: { type: "string", columnName: "short_name" },
					role: { type: "string", default: "guest" },
					status: { type: "string", required: true, default: "A" }
				};

				svc._processFields();
			});

			it("should accept all params", async () => {
				const params = {
					name: "John",
					shortName: "Joe",
					role: "admin",
					status: "D"
				};
				const res = await svc.validateParams(ctx, params, { type: "replace" });
				expect(res).toEqual({
					name: "John",
					short_name: "Joe",
					role: "admin",
					status: "D"
				});
			});

			it("should set default params if missing", async () => {
				const params = {
					name: "John"
				};
				const res = await svc.validateParams(ctx, params, { type: "replace" });
				expect(res).toEqual({
					name: "John",
					role: "guest",
					status: "A"
				});
			});

			it("should throw error if required is missing", async () => {
				const params = {};
				expect.assertions(6);
				try {
					await svc.validateParams(ctx, params, { type: "replace" });
				} catch (err) {
					expect(err).toBeInstanceOf(ValidationError);
					expect(err.name).toBe("ValidationError");
					expect(err.message).toBe("The field 'name' is required.");
					expect(err.type).toBe("REQUIRED_FIELD");
					expect(err.code).toBe(422);
					expect(err.data).toEqual({
						field: "name",
						value: undefined
					});
				}
			});

			it("should throw error if required is null", async () => {
				const params = {
					name: null
				};
				expect.assertions(6);
				try {
					await svc.validateParams(ctx, params, { type: "replace" });
				} catch (err) {
					expect(err).toBeInstanceOf(ValidationError);
					expect(err.name).toBe("ValidationError");
					expect(err.message).toBe("The field 'name' is required.");
					expect(err.type).toBe("REQUIRED_FIELD");
					expect(err.code).toBe(422);
					expect(err.data).toEqual({
						field: "name",
						value: null
					});
				}
			});

			it("set nullable", () => {
				svc.settings.fields.name.nullable = true;
				svc._processFields();
			});

			it("should throw if null & nullable", async () => {
				const params = {
					name: null
				};
				const res = await svc.validateParams(ctx, params, { type: "replace" });
				expect(res).toEqual({
					name: null,
					role: "guest",
					status: "A"
				});
			});

			it("should throw error if nullable but value is undefined", async () => {
				const params = {};
				expect.assertions(6);
				try {
					await svc.validateParams(ctx, params, { type: "replace" });
				} catch (err) {
					expect(err).toBeInstanceOf(ValidationError);
					expect(err.name).toBe("ValidationError");
					expect(err.message).toBe("The field 'name' is required.");
					expect(err.type).toBe("REQUIRED_FIELD");
					expect(err.code).toBe(422);
					expect(err.data).toEqual({
						field: "name",
						value: undefined
					});
				}
			});
		});

		describe("Test readonly & immutable", () => {
			beforeAll(() => {
				svc.settings.fields = {
					name: { type: "string", required: true },
					password: { type: "string", readonly: true },
					role: { type: "string", immutable: true }
				};

				svc._processFields();
			});

			it("should remove password & role field", async () => {
				const params = {
					name: "John",
					password: "pass1234",
					role: "admin"
				};
				const res = await svc.validateParams(ctx, params, { type: "replace" });
				expect(res).toEqual({
					name: "John"
				});
			});

			it("should not touch updateabe field if not exist", async () => {
				const params = {
					name: "John",
					password: "pass1234"
				};
				const res = await svc.validateParams(ctx, params, { type: "replace" });
				expect(res).toEqual({
					name: "John"
				});
			});
		});

		describe("Test hook", () => {
			const onReplace = jest.fn(async () => "Now");
			beforeAll(() => {
				svc.settings.fields = {
					createdAt: { onCreate: "Past" },
					createdBy: { onCreate: "Owner" },
					updatedAt: { onUpdate: "updated" },
					replacedAt: { onReplace },
					replacedBy: { onReplace: "replaced" },
					deletedAt: { onRemove: "removed" }
				};

				svc._processFields();
			});

			it("should call hook if value not exists", async () => {
				const params = {};
				const res = await svc.validateParams(ctx, params, { type: "replace" });
				expect(res).toEqual({
					replacedAt: "Now",
					replacedBy: "replaced"
				});

				expect(onReplace).toBeCalledTimes(1);
				expect(onReplace).toBeCalledWith(undefined, {}, ctx);
			});

			it("should call if value exists", async () => {
				onReplace.mockClear();

				const params = {
					replacedAt: "2020-09-19",
					replacedBy: "John"
				};
				const res = await svc.validateParams(ctx, params, { type: "replace" });
				expect(res).toEqual({
					replacedAt: "Now",
					replacedBy: "replaced"
				});

				expect(onReplace).toBeCalledTimes(1);
				expect(onReplace).toBeCalledWith("2020-09-19", params, ctx);
			});
		});

		testTypeConversion(ctx, svc, "replace");

		describe("Test custom validation", () => {
			const customValidate = jest.fn(value => (value.length < 3 ? "Too short" : true));
			beforeAll(() => {
				svc.settings.fields = {
					name: { type: "string", required: true, validate: customValidate }
				};

				svc._processFields();
			});

			it("should call custom validate", async () => {
				const params = {
					name: "John Doe"
				};
				const res = await svc.validateParams(ctx, params, { type: "replace" });
				expect(res).toEqual({
					name: "John Doe"
				});

				expect(customValidate).toBeCalledTimes(1);
				expect(customValidate).toBeCalledWith("John Doe", params, svc.$fields[0], ctx);
			});

			it("should throw error if not valid", async () => {
				const params = {
					name: "Al"
				};
				expect.assertions(6);
				try {
					await svc.validateParams(ctx, params, { type: "replace" });
				} catch (err) {
					expect(err).toBeInstanceOf(ValidationError);
					expect(err.name).toBe("ValidationError");
					expect(err.message).toBe("Too short");
					expect(err.type).toBe("VALIDATION_ERROR");
					expect(err.code).toBe(422);
					expect(err.data).toEqual({
						field: "name",
						value: "Al"
					});
				}
			});
		});
	});

	describe("Test fields validation at removing", () => {
		const broker = new ServiceBroker({ logger: false });
		const svc = broker.createService({
			name: "users",
			mixins: [DbService()],
			settings: {}
		});
		const ctx = Context.create(broker, null, {});

		beforeAll(() => broker.start());
		afterAll(() => broker.stop());

		describe("Test required, optional, default value", () => {
			beforeAll(() => {
				svc.settings.fields = {
					name: { type: "string", required: true },
					shortName: { type: "string", columnName: "short_name" },
					role: { type: "string", default: "guest" },
					status: { type: "string", required: true, default: "A" }
				};

				svc._processFields();
			});

			it("should drop all params", async () => {
				const params = {
					name: "John",
					shortName: "Joe",
					role: "admin",
					status: "D"
				};
				const res = await svc.validateParams(ctx, params, { type: "remove" });
				expect(res).toEqual({});
			});

			it("should not create default if missing", async () => {
				const params = {
					name: "John"
				};
				const res = await svc.validateParams(ctx, params, { type: "remove" });
				expect(res).toEqual({});
			});

			it("should not throw error if required is missing", async () => {
				const params = {};
				const res = await svc.validateParams(ctx, params, { type: "remove" });
				expect(res).toEqual({});
			});

			it("should not error if required is null", async () => {
				const params = {
					name: null
				};
				const res = await svc.validateParams(ctx, params, { type: "remove" });
				expect(res).toEqual({});
			});
		});

		describe("Test hook", () => {
			const onRemove = jest.fn(async () => "Now");
			beforeAll(() => {
				svc.settings.fields = {
					createdAt: { onCreate: "Past" },
					updatedAt: { onUpdate: "updated" },
					replacedBy: { onReplace: "replaced" },
					deletedAt: { onRemove },
					deletedBy: { onRemove: "deleted" }
				};

				svc._processFields();
			});

			it("should set soft delete", async () => {
				expect(svc.$softDelete).toBe(true);
			});

			it("should call hook if value not exists", async () => {
				const params = {};
				const res = await svc.validateParams(ctx, params, { type: "remove" });
				expect(res).toEqual({
					deletedAt: "Now",
					deletedBy: "deleted"
				});

				expect(onRemove).toBeCalledTimes(1);
				expect(onRemove).toBeCalledWith(undefined, {}, ctx);
			});

			it("should call if value exists", async () => {
				onRemove.mockClear();

				const params = {
					deletedAt: "2020-09-19",
					deletedBy: "John"
				};
				const res = await svc.validateParams(ctx, params, { type: "remove" });
				expect(res).toEqual({
					deletedAt: "Now",
					deletedBy: "deleted"
				});

				expect(onRemove).toBeCalledTimes(1);
				expect(onRemove).toBeCalledWith("2020-09-19", params, ctx);
			});
		});
	});

	describe("Test validator schema generation", () => {
		const broker = new ServiceBroker({ logger: false });
		const svc = broker.createService({
			name: "users",
			mixins: [DbService()]
		});

		beforeAll(() => broker.start());
		afterAll(() => broker.stop());

		it("generate validator schema for 'create'", async () => {
			const fields = svc._processFieldObject({
				id: { type: "string", primaryKey: true, columnName: "_id" },
				name: { type: "string", optional: false },
				username: { type: "string", required: true, min: 3, max: 100 },
				email: "email",
				password: { type: "string", hidden: true, min: 6 },
				age: { type: "number", positive: true, integer: true },
				bio: true,
				token: false,
				address: {
					type: "object",
					properties: {
						zip: { type: "number" },
						street: { type: "string" },
						state: { type: "string", optional: true },
						city: { type: "string", required: true },
						country: { type: "string" },
						primary: { type: "boolean", default: true }
					}
				},
				roles: {
					type: "array",
					max: 3,
					items: { type: "string" }
				},

				phones: {
					type: "array",
					items: {
						type: "object",
						properties: {
							type: "string",
							number: { type: "string", required: true },
							primary: { type: "boolean", default: false }
						}
					}
				},
				createdAt: { type: "date", readonly: true, onCreate: () => new Date() },
				updatedAt: { type: "date", readonly: true, onUpdate: () => new Date() },
				replacedAt: { type: "date", readonly: true, onReplace: () => new Date() },
				status: { type: "string", default: "A", onRemove: "D" }
			});

			expect(svc._generateValidatorSchemaForFields(fields, { type: "create" })).toEqual({
				$$strict: true,
				name: { type: "string" },
				username: { type: "string", max: 100, min: 3 },
				email: { type: "email", optional: true },
				password: { type: "string", min: 6, optional: true },
				age: {
					type: "number",
					positive: true,
					integer: true,
					optional: true,
					convert: true
				},
				address: {
					type: "object",
					optional: true,
					properties: {
						$$strict: true,
						zip: { type: "number", optional: true, convert: true },
						street: { type: "string", optional: true },
						state: { type: "string", optional: true },
						city: { type: "string" },
						country: { type: "string", optional: true },
						primary: { type: "boolean", convert: true, optional: true, default: true }
					}
				},
				roles: {
					type: "array",
					max: 3,
					optional: true,
					items: {
						type: "string"
					}
				},
				phones: {
					type: "array",
					optional: true,
					items: {
						type: "object",
						properties: {
							type: "string",
							number: { type: "string", required: true },
							primary: { type: "boolean", default: false }
						}
					}
				},
				bio: { type: "any", optional: true },
				status: { type: "string", default: "A", optional: true }
			});
		});
	});
});

function testTypeConversion(ctx, svc, type) {
	describe("Test type checking", () => {
		const date1 = new Date();
		beforeAll(() => {
			svc.settings.fields = {
				snum: { type: "number" },
				sbool: { type: "boolean" },
				sdate: { type: "date" },
				sstr: { type: "string" },
				num: { type: "string" },
				bool: { type: "string" },
				date: { type: "string" },
				str: { type: "string" }
			};

			svc._processFields();
		});

		it("should untouch null values", async () => {
			const params = {
				snum: null,
				sbool: null,
				sdate: null,
				sstr: null
			};
			const res = await svc.validateParams(ctx, params, { type });
			expect(res).toEqual({
				snum: null,
				sbool: null,
				sdate: null,
				sstr: null
			});
		});

		it("should untouch correct values", async () => {
			const params = {
				snum: 12345.67,
				sbool: true,
				sdate: date1,
				sstr: "John"
			};
			const res = await svc.validateParams(ctx, params, { type });
			expect(res).toEqual({
				snum: 12345.67,
				sbool: true,
				sdate: date1,
				sstr: "John"
			});
		});

		it("should convert incorrect values", async () => {
			const params = {
				snum: "12345.67",
				sbool: "true",
				sdate: date1.toISOString(),
				sstr: "John"
			};
			const res = await svc.validateParams(ctx, params, { type });
			expect(res).toEqual({
				snum: 12345.67,
				sbool: true,
				sdate: date1,
				sstr: "John"
			});
		});

		it("should convert incorrect values", async () => {
			const params = {
				num: 12345.67,
				bool: true,
				date: date1,
				str: "John"
			};
			const res = await svc.validateParams(ctx, params, { type });
			expect(res).toEqual({
				num: "12345.67",
				bool: "true",
				date: date1.toString(),
				str: "John"
			});
		});

		it("should untouch null values", async () => {
			const params = {
				num: null,
				bool: null,
				date: null,
				str: null
			};
			const res = await svc.validateParams(ctx, params, { type });
			expect(res).toEqual({
				num: null,
				bool: null,
				date: null,
				str: null
			});
		});

		it("should throw Cast error for invalid number", async () => {
			const params = {
				snum: "John123"
			};
			expect.assertions(6);
			try {
				await svc.validateParams(ctx, params, { type });
			} catch (err) {
				expect(err).toBeInstanceOf(ValidationError);
				expect(err.name).toBe("ValidationError");
				expect(err.message).toBe("Cast to Number failed for value 'John123'");
				expect(err.type).toBe("CAST_ERROR");
				expect(err.code).toBe(422);
				expect(err.data).toEqual({
					field: "snum",
					value: "John123"
				});
			}
		});

		it("should throw Cast error for invalid date", async () => {
			const params = {
				sdate: "John123"
			};
			expect.assertions(6);
			try {
				await svc.validateParams(ctx, params, { type });
			} catch (err) {
				expect(err).toBeInstanceOf(ValidationError);
				expect(err.name).toBe("ValidationError");
				expect(err.message).toBe("Cast to Date failed for value 'John123'");
				expect(err.type).toBe("CAST_ERROR");
				expect(err.code).toBe(422);
				expect(err.data).toEqual({
					field: "sdate",
					value: "John123"
				});
			}
		});
	});
}
