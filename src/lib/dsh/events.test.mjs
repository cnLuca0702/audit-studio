import test from 'node:test';
import assert from 'node:assert/strict';
import {initialEventState, translateUpdate, finishTurn} from './events.ts';
test('text and thinking accumulate without mutating prior state', () => {
  const empty = initialEventState();
  let result = translateUpdate(empty, {sessionUpdate:'agent_thought_chunk', content:{type:'text',text:'思考'}});
  assert.deepEqual(result.events.map(e=>e.type), ['message_start','message_update']);
  result = translateUpdate(result.state, {sessionUpdate:'agent_message_chunk', content:{type:'text',text:'答'}});
  result = translateUpdate(result.state, {sessionUpdate:'agent_message_chunk', content:{type:'text',text:'案'}});
  assert.deepEqual(result.state.message.content, [{type:'thinking',thinking:'思考'}, {type:'text',text:'答案'}]);
  assert.equal(empty.message,null);
});
test('tools start before text, finish once and preserve result', () => {
  let r = translateUpdate(initialEventState(), {sessionUpdate:'tool_call',toolCallId:'t1',title:'export_document',rawInput:{format:'docx'},status:'in_progress'});
  assert.deepEqual(r.events.map(e=>e.type), ['message_start','tool_execution_start']);
  const done = {sessionUpdate:'tool_call_update',toolCallId:'t1',status:'completed',content:[{type:'content',content:{type:'text',text:'saved'}}]};
  r = translateUpdate(r.state,done);
  assert.equal(r.events[0].result.content[0].text,'saved');
  assert.equal(r.state.message.content[0]._status,'done');
  assert.equal(translateUpdate(r.state,done).events.length,0);
});
test('tool failure and prompt error are visible', () => {
  const r = translateUpdate(initialEventState(), {sessionUpdate:'tool_call',toolCallId:'x',title:'bash',status:'failed'});
  assert.equal(r.events.at(-1).isError,true);
  const end = finishTurn(r.state,'error','upstream failed');
  assert.equal(end.events[0].message.errorMessage,'upstream failed');
  assert.equal(end.events[0].message.stopReason,'error');
  assert.equal(end.events.at(-1).type,'agent_end');
});
test('cancel produces aborted message and closes the turn', () => {
  const r = translateUpdate(initialEventState(), {sessionUpdate:'agent_message_chunk',content:{type:'text',text:'partial'}});
  assert.equal(finishTurn(r.state,'cancelled').events[0].message.stopReason,'aborted');
  assert.deepEqual(finishTurn(initialEventState(),'cancelled').events,[{type:'agent_end'}]);
});
test('config options preserve model_select and thinking_level_changed shapes', () => {
  const r = translateUpdate(initialEventState(),{sessionUpdate:'config_option_update',configOptions:[{id:'model',currentValue:'["local","m"]'},{id:'reasoning_effort',currentValue:'high'}]});
  assert.deepEqual(r.events,[{type:'model_select',model:{provider:'local',id:'m'}},{type:'thinking_level_changed',level:'high'}]);
});
