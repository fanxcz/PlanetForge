(() => {
"use strict";
function clone(value){return JSON.parse(JSON.stringify(value));}
function create(options){
 const undoStack=[],redoStack=[],limit=Math.max(10,Number(options.limit)||60);
 function notify(){if(typeof options.onChange==="function")options.onChange({canUndo:undoStack.length>0,canRedo:redoStack.length>0});}
 function pushBounded(stack,value){stack.push(clone(value));if(stack.length>limit)stack.splice(0,stack.length-limit);}
 return {
  checkpoint(){pushBounded(undoStack,options.capture());redoStack.length=0;notify();},
  undo(){if(!undoStack.length)return false;pushBounded(redoStack,options.capture());options.restore(undoStack.pop());notify();return true;},
  redo(){if(!redoStack.length)return false;pushBounded(undoStack,options.capture());options.restore(redoStack.pop());notify();return true;},
  reset(){undoStack.length=0;redoStack.length=0;notify();},
  state(){return{canUndo:undoStack.length>0,canRedo:redoStack.length>0,undoCount:undoStack.length,redoCount:redoStack.length};}
 };
}
window.PlanetForgeHistory={create};
})();
