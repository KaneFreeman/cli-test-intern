import * as fs from 'fs';
import * as mockery from 'mockery';
import * as sinon from 'sinon';
import * as path from 'path';
import MockModule from '../support/MockModule';
import { throwImmediately } from '../support/util';
import { Command } from '@dojo/cli/interfaces';

const { beforeEach, afterEach, describe, it } = intern.getInterface('bdd');
const { assert } = intern.getPlugin('chai');

describe('main', () => {
	let moduleUnderTest: Command;
	let mockModule: MockModule;
	let mockRunTests: any;
	let mockJavaCheck: any;
	let sandbox: sinon.SinonSandbox;
	let consoleStub: sinon.SinonStub;
	let mockReadFile: sinon.SinonStub;

	function assertLog(include: string) {
		let found = false;

		consoleStub.args.forEach((call) => {
			call.forEach((arg) => {
				if (arg.indexOf(include) >= 0) {
					found = true;
				}
			});
		});

		assert.isTrue(found, `was expecting "${include}" to be logged in the console`);
	}

	beforeEach(() => {
		sandbox = sinon.sandbox.create();
		consoleStub = sandbox.stub(console, 'log');
		mockModule = new MockModule('../../src/main', require);

		mockRunTests = {
			default: sandbox.stub().returns(Promise.resolve())
		};
		mockery.registerMock('./runTests', mockRunTests);

		mockJavaCheck = {
			default: sandbox.stub().returns(Promise.resolve(true))
		};
		mockery.registerMock('./javaCheck', mockJavaCheck);

		moduleUnderTest = mockModule.getModuleUnderTest().default;
		mockReadFile = sandbox.stub(fs, 'readFileSync');
	});

	afterEach(() => {
		sandbox.restore();
		mockModule.destroy();
	});

	it('should register supported arguments', () => {
		const options = sandbox.stub();
		moduleUnderTest.register(options, <any>undefined);

		let untestedArguments: { [key: string]: string | undefined } = {
			a: 'all',
			c: 'config',
			f: 'functional',
			n: 'node',
			k: 'testingKey',
			usr: 'userName',
			r: 'reporters',
			s: 'secret',
			u: 'unit',
			v: 'verbose',
			filter: undefined
		};

		for (let i = 0; i < options.callCount; i++) {
			const call = options.getCall(i);

			assert.isTrue(
				call.args[0] in untestedArguments,
				`Argument "${call.args[0]}" should be in untestedArguments`
			);
			assert.strictEqual(call.args[1].alias, untestedArguments[call.args[0]]);

			delete untestedArguments[call.args[0]];
		}

		assert.isTrue(
			Object.keys(untestedArguments).length === 0,
			`Not all commands are tested: "${Object.keys(untestedArguments).join('", "')}"`
		);
	});

	it('should fail if the java check fails', () => {
		mockJavaCheck['default'] = sandbox.stub().returns(Promise.resolve(false));
		return moduleUnderTest.run(<any>{}, <any>{ all: true }).then(throwImmediately, (e: Error) => {
			assert.include(e.message, 'Error! Java VM could not be found.');
		});
	});

	it('should enable all tests when all is passed', () => {
		sandbox.stub(fs, 'existsSync').callsFake((path: string) => true);
		mockReadFile.returns(`{
				"name": "@dojo/cli-test-intern",
				"version": "test-version"
			}`);

		const helper = {
			command: {
				exists: sandbox.stub().returns(true),
				run: sandbox.stub().returns(Promise.resolve())
			}
		};
		const runTestArgs = { node: true, all: true };
		return moduleUnderTest.run(<any>helper, <any>runTestArgs).then(() => {
			assert.isTrue(mockRunTests.default.calledOnce, 'Should have called the runTests module');
			assert.strictEqual(mockRunTests.default.args[0][0].nodeUnit, true);
			assert.strictEqual(mockRunTests.default.args[0][0].remoteUnit, true);
			assert.strictEqual(mockRunTests.default.args[0][0].remoteFunctional, true);
		});
	});

	it('should enable node/remote tests when unit tests is passed', () => {
		sandbox.stub(fs, 'existsSync').callsFake((path: string) => true);
		mockReadFile.returns(`{
				"name": "@dojo/cli-test-intern",
				"version": "test-version"
			}`);

		const helper = {
			command: {
				exists: sandbox.stub().returns(true),
				run: sandbox.stub().returns(Promise.resolve())
			}
		};
		const runTestArgs = { node: true, unit: true };
		return moduleUnderTest.run(<any>helper, <any>runTestArgs).then(() => {
			assert.isTrue(mockRunTests.default.calledOnce, 'Should have called the runTests module');
			assert.strictEqual(mockRunTests.default.args[0][0].nodeUnit, true);
			assert.strictEqual(mockRunTests.default.args[0][0].remoteUnit, true);
			assert.strictEqual(mockRunTests.default.args[0][0].remoteFunctional, false);
		});
	});

	it('should enable functional, and disable node, tests when functional tests is passed', () => {
		sandbox.stub(fs, 'existsSync').callsFake((path: string) => true);
		mockReadFile.returns(`{
				"name": "@dojo/cli-test-intern",
				"version": "test-version"
			}`);

		const helper = {
			command: {
				exists: sandbox.stub().returns(true),
				run: sandbox.stub().returns(Promise.resolve())
			}
		};
		const runTestArgs = { node: true, functional: true };
		return moduleUnderTest.run(<any>helper, <any>runTestArgs).then(() => {
			assert.isTrue(mockRunTests.default.calledOnce, 'Should have called the runTests module');
			assert.strictEqual(mockRunTests.default.args[0][0].nodeUnit, false);
			assert.strictEqual(mockRunTests.default.args[0][0].remoteUnit, false);
			assert.strictEqual(mockRunTests.default.args[0][0].remoteFunctional, true);
		});
	});

	it('should support eject', () => {
		mockReadFile.returns(`{
				"name": "@dojo/cli-test-intern",
				"version": "test-version",
				"dependencies": {
					"dep1": "dep1v",
					"dep2": "dep2v"
				}
			}`);

		const result = (<any>moduleUnderTest).eject({});

		assert.isTrue('npm' in result, 'expecting npm property');
		assert.isTrue('devDependencies' in result.npm, 'expecting a devDependencies property');
		assert.deepEqual(result.npm.devDependencies, {
			dep1: 'dep1v',
			dep2: 'dep2v'
		});

		assert.isTrue('copy' in result, 'Should have returned a list of files to copy');
		assert.isTrue('files' in result.copy, 'Should have returned a list of files to copy');
		assert.deepEqual(result.copy.files, ['intern.json']);
		result.copy.files.forEach((file: string) => {
			assert.isTrue(fs.existsSync(path.join(result.copy.path, 'intern.json')));
		});
	});

	it('should fail if package.json fails to be read', () => {
		mockReadFile.throws(new Error('test error'));

		try {
			(<any>moduleUnderTest).eject({});
			assert.fail('Should not have succeeded');
		} catch (e) {
			assert.equal(e.message, 'Failed reading dependencies from package.json - test error');
		}
	});

	describe('JIT tests', () => {
		it('should print JIT information on success', () => {
			sandbox.stub(fs, 'existsSync').callsFake((path: string) => true);
			const helper = {
				command: {
					exists: sandbox.stub().returns(true),
					run: sandbox.stub().returns(Promise.resolve())
				}
			};
			const runTestArgs = { node: true, all: true };
			return moduleUnderTest.run(<any>helper, <any>runTestArgs).then(() => {
				assertLog('These tests were run using Dojo JIT compilation.');
			});
		});

		it('should print JIT information on failure', () => {
			sandbox.stub(fs, 'existsSync').callsFake((path: string) => true);
			const helper = {
				command: {
					exists: sandbox.stub().returns(true),
					run: sandbox.stub().returns(Promise.resolve())
				}
			};
			const runTestArgs = { node: true, all: true };
			mockRunTests.default.returns(Promise.reject('error'));
			return moduleUnderTest.run(<any>helper, <any>runTestArgs).then(
				() => {
					assert.fail('should have failed');
				},
				() => {
					assertLog('These tests were run using Dojo JIT compilation.');
				}
			);
		});
	});

	describe('local tests', () => {
		it('should print browser link on success', () => {
			sandbox.stub(fs, 'existsSync').callsFake((path: string) => true);
			const helper = {
				command: {
					exists: sandbox.stub().returns(true),
					run: sandbox.stub().returns(Promise.resolve())
				}
			};
			const runTestArgs = { node: true, all: true, config: 'local' };
			return moduleUnderTest.run(<any>helper, <any>runTestArgs).then(() => {
				assertLog(
					'If the project directory is hosted on a local server, unit tests can also be run in browser by navigating to'
				);
			});
		});

		it('should print browser link on failure', () => {
			sandbox.stub(fs, 'existsSync').callsFake((path: string) => true);
			const helper = {
				command: {
					exists: sandbox.stub().returns(true),
					run: sandbox.stub().returns(Promise.resolve())
				}
			};
			const runTestArgs = { node: true, all: true, config: 'local' };
			mockRunTests.default.returns(Promise.reject('error'));
			return moduleUnderTest.run(<any>helper, <any>runTestArgs).then(
				() => {
					assert.fail('should have failed');
				},
				() => {
					assertLog(
						'If the project directory is hosted on a local server, unit tests can also be run in browser by navigating to'
					);
				}
			);
		});

		it('should print browser link with filter option', () => {
			sandbox.stub(fs, 'existsSync').callsFake((path: string) => true);
			const helper = {
				command: {
					exists: sandbox.stub().returns(true),
					run: sandbox.stub().returns(Promise.resolve())
				}
			};
			const runTestArgs = { node: true, all: true, filter: 'test', config: 'local' };
			return moduleUnderTest.run(<any>helper, <any>runTestArgs).then(() => {
				assertLog(
					'If the project directory is hosted on a local server, unit tests can also be run in browser by navigating to'
				);
				assertLog('grep=test');
			});
		});

		it('should throw an error if running all and no unit tests are found', async () => {
			let error: Error;
			sandbox.stub(fs, 'existsSync').callsFake((path: string) => {
				return path.indexOf('unit') === -1;
			});
			try {
				await moduleUnderTest.run(
					{} as any,
					{
						config: 'local',
						all: true
					} as any
				);
			} catch (e) {
				error = e;
			}
			assert.equal(
				error!.message,
				'Could not find tests, have you built the tests using dojo build?\n\nFor @dojo/cli-build-app run: dojo build app --mode unit or dojo build app --mode functional'
			);
		});

		it('should throw an error if running all and no functional tests are found', async () => {
			let error: Error;
			sandbox.stub(fs, 'existsSync').callsFake((path: string) => {
				return path.indexOf('functional') === -1;
			});
			try {
				await moduleUnderTest.run(
					{} as any,
					{
						config: 'local',
						all: true
					} as any
				);
			} catch (e) {
				error = e;
			}
			assert.equal(
				error!.message,
				'Could not find tests, have you built the tests using dojo build?\n\nFor @dojo/cli-build-app run: dojo build app --mode unit or dojo build app --mode functional'
			);
		});

		it('should throw an error if running units and no tests are found', async () => {
			let error: Error;
			sandbox.stub(fs, 'existsSync').callsFake((path: string) => {
				return path.indexOf('unit') === -1;
			});
			try {
				await moduleUnderTest.run(
					{} as any,
					{
						config: 'local',
						unit: true
					} as any
				);
			} catch (e) {
				error = e;
			}
			assert.equal(
				error!.message,
				'Could not find tests, have you built the tests using dojo build?\n\nFor @dojo/cli-build-app run: dojo build app --mode unit or dojo build app --mode functional'
			);
		});

		it('should throw an error if running functionals and no tests are found', async () => {
			let error: Error;
			sandbox.stub(fs, 'existsSync').callsFake((path: string) => {
				return path.indexOf('functional') === -1;
			});
			try {
				await moduleUnderTest.run(
					{} as any,
					{
						config: 'local',
						functional: true
					} as any
				);
			} catch (e) {
				error = e;
			}
			assert.equal(
				error!.message,
				'Could not find tests, have you built the tests using dojo build?\n\nFor @dojo/cli-build-app run: dojo build app --mode unit or dojo build app --mode functional'
			);
		});

		it('should throw an error with file if no tests are found when using --verbose flag', async () => {
			let error: Error;
			sandbox.stub(fs, 'existsSync').callsFake((path: string) => false);
			try {
				await moduleUnderTest.run(
					{} as any,
					{
						config: 'local',
						verbose: true,
						all: true
					} as any
				);
			} catch (e) {
				error = e;
			}
			assert.include(
				error!.message,
				'Have you built the tests using dojo build?\n\nFor @dojo/cli-build-app run: dojo build app --mode unit or dojo build app --mode functional'
			);
		});
	});
});
