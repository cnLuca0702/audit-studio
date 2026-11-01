import test from 'node:test';
import assert from 'node:assert/strict';
import {reasoningSelection} from './selection.ts';
const option = (currentValue,options) => [{id:'reasoning_effort',type:'select',name:'Thinking',currentValue,options}];
test('models without reasoning ignore global or previously saved thinking levels',()=>{
 assert.deepEqual(reasoningSelection([], 'high'),{level:'off',change:undefined});
});
test('supported saved effort overrides current provider choice',()=>{
 assert.deepEqual(reasoningSelection(option('low',[{value:'low',name:'Low'},{value:'high',name:'High'}]),'high'),{level:'high',change:'high'});
});
test('unavailable saved level follows the advertised model default',()=>{
 assert.deepEqual(reasoningSelection(option('low',[{value:'low',name:'Low'}]),'high'),{level:'low',change:undefined});
});
test('off is restored explicitly when the resumed session has thinking enabled',()=>{
 assert.deepEqual(reasoningSelection(option('high',[{value:'off',name:'Off'},{value:'high',name:'High'}]),'off'),{level:'off',change:'off'});
});
test('grouped options and empty provider-default choices are supported',()=>{
 assert.deepEqual(reasoningSelection(option('',[{group:'efforts',name:'Efforts',options:[{value:'high',name:'High'}]}]),'high'),{level:'high',change:'high'});
 assert.deepEqual(reasoningSelection(option('',[{value:'',name:'Default'}])),{level:'off',change:undefined});
});

test('validation only accepts choices advertised by the actual model',async()=>{
 const {reasoningChoices}=await import('./selection.ts');
 assert.deepEqual(reasoningChoices([]),[]);
 assert.deepEqual(reasoningChoices(option('low',[{group:'efforts',name:'Efforts',options:[{value:'low',name:'Low'}]}])),['low']);
});
