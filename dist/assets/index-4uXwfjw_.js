(function(){const y=document.createElement("link").relList;if(y&&y.supports&&y.supports("modulepreload"))return;for(const v of document.querySelectorAll('link[rel="modulepreload"]'))x(v);new MutationObserver(v=>{for(const b of v)if(b.type==="childList")for(const I of b.addedNodes)I.tagName==="LINK"&&I.rel==="modulepreload"&&x(I)}).observe(document,{childList:!0,subtree:!0});function o(v){const b={};return v.integrity&&(b.integrity=v.integrity),v.referrerPolicy&&(b.referrerPolicy=v.referrerPolicy),v.crossOrigin==="use-credentials"?b.credentials="include":v.crossOrigin==="anonymous"?b.credentials="omit":b.credentials="same-origin",b}function x(v){if(v.ep)return;v.ep=!0;const b=o(v);fetch(v.href,b)}})();function qu(m){return m&&m.__esModule&&Object.prototype.hasOwnProperty.call(m,"default")?m.default:m}var La={exports:{}},Nr={},Ba={exports:{}},re={};/**
 * @license React
 * react.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var Pu;function Jp(){if(Pu)return re;Pu=1;var m=Symbol.for("react.element"),y=Symbol.for("react.portal"),o=Symbol.for("react.fragment"),x=Symbol.for("react.strict_mode"),v=Symbol.for("react.profiler"),b=Symbol.for("react.provider"),I=Symbol.for("react.context"),z=Symbol.for("react.forward_ref"),N=Symbol.for("react.suspense"),H=Symbol.for("react.memo"),U=Symbol.for("react.lazy"),T=Symbol.iterator;function L(d){return d===null||typeof d!="object"?null:(d=T&&d[T]||d["@@iterator"],typeof d=="function"?d:null)}var $={isMounted:function(){return!1},enqueueForceUpdate:function(){},enqueueReplaceState:function(){},enqueueSetState:function(){}},P=Object.assign,W={};function Q(d,w,J){this.props=d,this.context=w,this.refs=W,this.updater=J||$}Q.prototype.isReactComponent={},Q.prototype.setState=function(d,w){if(typeof d!="object"&&typeof d!="function"&&d!=null)throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");this.updater.enqueueSetState(this,d,w,"setState")},Q.prototype.forceUpdate=function(d){this.updater.enqueueForceUpdate(this,d,"forceUpdate")};function he(){}he.prototype=Q.prototype;function ce(d,w,J){this.props=d,this.context=w,this.refs=W,this.updater=J||$}var me=ce.prototype=new he;me.constructor=ce,P(me,Q.prototype),me.isPureReactComponent=!0;var oe=Array.isArray,He=Object.prototype.hasOwnProperty,Ce={current:null},Ae={key:!0,ref:!0,__self:!0,__source:!0};function A(d,w,J){var C,F={},Z=null,le=null;if(w!=null)for(C in w.ref!==void 0&&(le=w.ref),w.key!==void 0&&(Z=""+w.key),w)He.call(w,C)&&!Ae.hasOwnProperty(C)&&(F[C]=w[C]);var ee=arguments.length-2;if(ee===1)F.children=J;else if(1<ee){for(var pe=Array(ee),Le=0;Le<ee;Le++)pe[Le]=arguments[Le+2];F.children=pe}if(d&&d.defaultProps)for(C in ee=d.defaultProps,ee)F[C]===void 0&&(F[C]=ee[C]);return{$$typeof:m,type:d,key:Z,ref:le,props:F,_owner:Ce.current}}function ie(d,w){return{$$typeof:m,type:d.type,key:w,ref:d.ref,props:d.props,_owner:d._owner}}function te(d){return typeof d=="object"&&d!==null&&d.$$typeof===m}function ne(d){var w={"=":"=0",":":"=2"};return"$"+d.replace(/[=:]/g,function(J){return w[J]})}var be=/\/+/g;function ue(d,w){return typeof d=="object"&&d!==null&&d.key!=null?ne(""+d.key):w.toString(36)}function Oe(d,w,J,C,F){var Z=typeof d;(Z==="undefined"||Z==="boolean")&&(d=null);var le=!1;if(d===null)le=!0;else switch(Z){case"string":case"number":le=!0;break;case"object":switch(d.$$typeof){case m:case y:le=!0}}if(le)return le=d,F=F(le),d=C===""?"."+ue(le,0):C,oe(F)?(J="",d!=null&&(J=d.replace(be,"$&/")+"/"),Oe(F,w,J,"",function(Le){return Le})):F!=null&&(te(F)&&(F=ie(F,J+(!F.key||le&&le.key===F.key?"":(""+F.key).replace(be,"$&/")+"/")+d)),w.push(F)),1;if(le=0,C=C===""?".":C+":",oe(d))for(var ee=0;ee<d.length;ee++){Z=d[ee];var pe=C+ue(Z,ee);le+=Oe(Z,w,J,pe,F)}else if(pe=L(d),typeof pe=="function")for(d=pe.call(d),ee=0;!(Z=d.next()).done;)Z=Z.value,pe=C+ue(Z,ee++),le+=Oe(Z,w,J,pe,F);else if(Z==="object")throw w=String(d),Error("Objects are not valid as a React child (found: "+(w==="[object Object]"?"object with keys {"+Object.keys(d).join(", ")+"}":w)+"). If you meant to render a collection of children, use an array instead.");return le}function Ve(d,w,J){if(d==null)return d;var C=[],F=0;return Oe(d,C,"","",function(Z){return w.call(J,Z,F++)}),C}function je(d){if(d._status===-1){var w=d._result;w=w(),w.then(function(J){(d._status===0||d._status===-1)&&(d._status=1,d._result=J)},function(J){(d._status===0||d._status===-1)&&(d._status=2,d._result=J)}),d._status===-1&&(d._status=0,d._result=w)}if(d._status===1)return d._result.default;throw d._result}var xe={current:null},O={transition:null},Y={ReactCurrentDispatcher:xe,ReactCurrentBatchConfig:O,ReactCurrentOwner:Ce};function B(){throw Error("act(...) is not supported in production builds of React.")}return re.Children={map:Ve,forEach:function(d,w,J){Ve(d,function(){w.apply(this,arguments)},J)},count:function(d){var w=0;return Ve(d,function(){w++}),w},toArray:function(d){return Ve(d,function(w){return w})||[]},only:function(d){if(!te(d))throw Error("React.Children.only expected to receive a single React element child.");return d}},re.Component=Q,re.Fragment=o,re.Profiler=v,re.PureComponent=ce,re.StrictMode=x,re.Suspense=N,re.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED=Y,re.act=B,re.cloneElement=function(d,w,J){if(d==null)throw Error("React.cloneElement(...): The argument must be a React element, but you passed "+d+".");var C=P({},d.props),F=d.key,Z=d.ref,le=d._owner;if(w!=null){if(w.ref!==void 0&&(Z=w.ref,le=Ce.current),w.key!==void 0&&(F=""+w.key),d.type&&d.type.defaultProps)var ee=d.type.defaultProps;for(pe in w)He.call(w,pe)&&!Ae.hasOwnProperty(pe)&&(C[pe]=w[pe]===void 0&&ee!==void 0?ee[pe]:w[pe])}var pe=arguments.length-2;if(pe===1)C.children=J;else if(1<pe){ee=Array(pe);for(var Le=0;Le<pe;Le++)ee[Le]=arguments[Le+2];C.children=ee}return{$$typeof:m,type:d.type,key:F,ref:Z,props:C,_owner:le}},re.createContext=function(d){return d={$$typeof:I,_currentValue:d,_currentValue2:d,_threadCount:0,Provider:null,Consumer:null,_defaultValue:null,_globalName:null},d.Provider={$$typeof:b,_context:d},d.Consumer=d},re.createElement=A,re.createFactory=function(d){var w=A.bind(null,d);return w.type=d,w},re.createRef=function(){return{current:null}},re.forwardRef=function(d){return{$$typeof:z,render:d}},re.isValidElement=te,re.lazy=function(d){return{$$typeof:U,_payload:{_status:-1,_result:d},_init:je}},re.memo=function(d,w){return{$$typeof:H,type:d,compare:w===void 0?null:w}},re.startTransition=function(d){var w=O.transition;O.transition={};try{d()}finally{O.transition=w}},re.unstable_act=B,re.useCallback=function(d,w){return xe.current.useCallback(d,w)},re.useContext=function(d){return xe.current.useContext(d)},re.useDebugValue=function(){},re.useDeferredValue=function(d){return xe.current.useDeferredValue(d)},re.useEffect=function(d,w){return xe.current.useEffect(d,w)},re.useId=function(){return xe.current.useId()},re.useImperativeHandle=function(d,w,J){return xe.current.useImperativeHandle(d,w,J)},re.useInsertionEffect=function(d,w){return xe.current.useInsertionEffect(d,w)},re.useLayoutEffect=function(d,w){return xe.current.useLayoutEffect(d,w)},re.useMemo=function(d,w){return xe.current.useMemo(d,w)},re.useReducer=function(d,w,J){return xe.current.useReducer(d,w,J)},re.useRef=function(d){return xe.current.useRef(d)},re.useState=function(d){return xe.current.useState(d)},re.useSyncExternalStore=function(d,w,J){return xe.current.useSyncExternalStore(d,w,J)},re.useTransition=function(){return xe.current.useTransition()},re.version="18.3.1",re}var Mu;function Ua(){return Mu||(Mu=1,Ba.exports=Jp()),Ba.exports}/**
 * @license React
 * react-jsx-runtime.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var Wu;function ed(){if(Wu)return Nr;Wu=1;var m=Ua(),y=Symbol.for("react.element"),o=Symbol.for("react.fragment"),x=Object.prototype.hasOwnProperty,v=m.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner,b={key:!0,ref:!0,__self:!0,__source:!0};function I(z,N,H){var U,T={},L=null,$=null;H!==void 0&&(L=""+H),N.key!==void 0&&(L=""+N.key),N.ref!==void 0&&($=N.ref);for(U in N)x.call(N,U)&&!b.hasOwnProperty(U)&&(T[U]=N[U]);if(z&&z.defaultProps)for(U in N=z.defaultProps,N)T[U]===void 0&&(T[U]=N[U]);return{$$typeof:y,type:z,key:L,ref:$,props:T,_owner:v.current}}return Nr.Fragment=o,Nr.jsx=I,Nr.jsxs=I,Nr}var ju;function td(){return ju||(ju=1,La.exports=ed()),La.exports}var u=td(),q=Ua();const nd=qu(q);var zi={},Da={exports:{}},Je={},Pa={exports:{}},Ma={};/**
 * @license React
 * scheduler.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var zu;function rd(){return zu||(zu=1,(function(m){function y(O,Y){var B=O.length;O.push(Y);e:for(;0<B;){var d=B-1>>>1,w=O[d];if(0<v(w,Y))O[d]=Y,O[B]=w,B=d;else break e}}function o(O){return O.length===0?null:O[0]}function x(O){if(O.length===0)return null;var Y=O[0],B=O.pop();if(B!==Y){O[0]=B;e:for(var d=0,w=O.length,J=w>>>1;d<J;){var C=2*(d+1)-1,F=O[C],Z=C+1,le=O[Z];if(0>v(F,B))Z<w&&0>v(le,F)?(O[d]=le,O[Z]=B,d=Z):(O[d]=F,O[C]=B,d=C);else if(Z<w&&0>v(le,B))O[d]=le,O[Z]=B,d=Z;else break e}}return Y}function v(O,Y){var B=O.sortIndex-Y.sortIndex;return B!==0?B:O.id-Y.id}if(typeof performance=="object"&&typeof performance.now=="function"){var b=performance;m.unstable_now=function(){return b.now()}}else{var I=Date,z=I.now();m.unstable_now=function(){return I.now()-z}}var N=[],H=[],U=1,T=null,L=3,$=!1,P=!1,W=!1,Q=typeof setTimeout=="function"?setTimeout:null,he=typeof clearTimeout=="function"?clearTimeout:null,ce=typeof setImmediate<"u"?setImmediate:null;typeof navigator<"u"&&navigator.scheduling!==void 0&&navigator.scheduling.isInputPending!==void 0&&navigator.scheduling.isInputPending.bind(navigator.scheduling);function me(O){for(var Y=o(H);Y!==null;){if(Y.callback===null)x(H);else if(Y.startTime<=O)x(H),Y.sortIndex=Y.expirationTime,y(N,Y);else break;Y=o(H)}}function oe(O){if(W=!1,me(O),!P)if(o(N)!==null)P=!0,je(He);else{var Y=o(H);Y!==null&&xe(oe,Y.startTime-O)}}function He(O,Y){P=!1,W&&(W=!1,he(A),A=-1),$=!0;var B=L;try{for(me(Y),T=o(N);T!==null&&(!(T.expirationTime>Y)||O&&!ne());){var d=T.callback;if(typeof d=="function"){T.callback=null,L=T.priorityLevel;var w=d(T.expirationTime<=Y);Y=m.unstable_now(),typeof w=="function"?T.callback=w:T===o(N)&&x(N),me(Y)}else x(N);T=o(N)}if(T!==null)var J=!0;else{var C=o(H);C!==null&&xe(oe,C.startTime-Y),J=!1}return J}finally{T=null,L=B,$=!1}}var Ce=!1,Ae=null,A=-1,ie=5,te=-1;function ne(){return!(m.unstable_now()-te<ie)}function be(){if(Ae!==null){var O=m.unstable_now();te=O;var Y=!0;try{Y=Ae(!0,O)}finally{Y?ue():(Ce=!1,Ae=null)}}else Ce=!1}var ue;if(typeof ce=="function")ue=function(){ce(be)};else if(typeof MessageChannel<"u"){var Oe=new MessageChannel,Ve=Oe.port2;Oe.port1.onmessage=be,ue=function(){Ve.postMessage(null)}}else ue=function(){Q(be,0)};function je(O){Ae=O,Ce||(Ce=!0,ue())}function xe(O,Y){A=Q(function(){O(m.unstable_now())},Y)}m.unstable_IdlePriority=5,m.unstable_ImmediatePriority=1,m.unstable_LowPriority=4,m.unstable_NormalPriority=3,m.unstable_Profiling=null,m.unstable_UserBlockingPriority=2,m.unstable_cancelCallback=function(O){O.callback=null},m.unstable_continueExecution=function(){P||$||(P=!0,je(He))},m.unstable_forceFrameRate=function(O){0>O||125<O?console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported"):ie=0<O?Math.floor(1e3/O):5},m.unstable_getCurrentPriorityLevel=function(){return L},m.unstable_getFirstCallbackNode=function(){return o(N)},m.unstable_next=function(O){switch(L){case 1:case 2:case 3:var Y=3;break;default:Y=L}var B=L;L=Y;try{return O()}finally{L=B}},m.unstable_pauseExecution=function(){},m.unstable_requestPaint=function(){},m.unstable_runWithPriority=function(O,Y){switch(O){case 1:case 2:case 3:case 4:case 5:break;default:O=3}var B=L;L=O;try{return Y()}finally{L=B}},m.unstable_scheduleCallback=function(O,Y,B){var d=m.unstable_now();switch(typeof B=="object"&&B!==null?(B=B.delay,B=typeof B=="number"&&0<B?d+B:d):B=d,O){case 1:var w=-1;break;case 2:w=250;break;case 5:w=1073741823;break;case 4:w=1e4;break;default:w=5e3}return w=B+w,O={id:U++,callback:Y,priorityLevel:O,startTime:B,expirationTime:w,sortIndex:-1},B>d?(O.sortIndex=B,y(H,O),o(N)===null&&O===o(H)&&(W?(he(A),A=-1):W=!0,xe(oe,B-d))):(O.sortIndex=w,y(N,O),P||$||(P=!0,je(He))),O},m.unstable_shouldYield=ne,m.unstable_wrapCallback=function(O){var Y=L;return function(){var B=L;L=Y;try{return O.apply(this,arguments)}finally{L=B}}}})(Ma)),Ma}var Uu;function id(){return Uu||(Uu=1,Pa.exports=rd()),Pa.exports}/**
 * @license React
 * react-dom.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var Gu;function ld(){if(Gu)return Je;Gu=1;var m=Ua(),y=id();function o(e){for(var t="https://reactjs.org/docs/error-decoder.html?invariant="+e,n=1;n<arguments.length;n++)t+="&args[]="+encodeURIComponent(arguments[n]);return"Minified React error #"+e+"; visit "+t+" for the full message or use the non-minified dev environment for full errors and additional helpful warnings."}var x=new Set,v={};function b(e,t){I(e,t),I(e+"Capture",t)}function I(e,t){for(v[e]=t,e=0;e<t.length;e++)x.add(t[e])}var z=!(typeof window>"u"||typeof window.document>"u"||typeof window.document.createElement>"u"),N=Object.prototype.hasOwnProperty,H=/^[:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*$/,U={},T={};function L(e){return N.call(T,e)?!0:N.call(U,e)?!1:H.test(e)?T[e]=!0:(U[e]=!0,!1)}function $(e,t,n,r){if(n!==null&&n.type===0)return!1;switch(typeof t){case"function":case"symbol":return!0;case"boolean":return r?!1:n!==null?!n.acceptsBooleans:(e=e.toLowerCase().slice(0,5),e!=="data-"&&e!=="aria-");default:return!1}}function P(e,t,n,r){if(t===null||typeof t>"u"||$(e,t,n,r))return!0;if(r)return!1;if(n!==null)switch(n.type){case 3:return!t;case 4:return t===!1;case 5:return isNaN(t);case 6:return isNaN(t)||1>t}return!1}function W(e,t,n,r,i,l,a){this.acceptsBooleans=t===2||t===3||t===4,this.attributeName=r,this.attributeNamespace=i,this.mustUseProperty=n,this.propertyName=e,this.type=t,this.sanitizeURL=l,this.removeEmptyString=a}var Q={};"children dangerouslySetInnerHTML defaultValue defaultChecked innerHTML suppressContentEditableWarning suppressHydrationWarning style".split(" ").forEach(function(e){Q[e]=new W(e,0,!1,e,null,!1,!1)}),[["acceptCharset","accept-charset"],["className","class"],["htmlFor","for"],["httpEquiv","http-equiv"]].forEach(function(e){var t=e[0];Q[t]=new W(t,1,!1,e[1],null,!1,!1)}),["contentEditable","draggable","spellCheck","value"].forEach(function(e){Q[e]=new W(e,2,!1,e.toLowerCase(),null,!1,!1)}),["autoReverse","externalResourcesRequired","focusable","preserveAlpha"].forEach(function(e){Q[e]=new W(e,2,!1,e,null,!1,!1)}),"allowFullScreen async autoFocus autoPlay controls default defer disabled disablePictureInPicture disableRemotePlayback formNoValidate hidden loop noModule noValidate open playsInline readOnly required reversed scoped seamless itemScope".split(" ").forEach(function(e){Q[e]=new W(e,3,!1,e.toLowerCase(),null,!1,!1)}),["checked","multiple","muted","selected"].forEach(function(e){Q[e]=new W(e,3,!0,e,null,!1,!1)}),["capture","download"].forEach(function(e){Q[e]=new W(e,4,!1,e,null,!1,!1)}),["cols","rows","size","span"].forEach(function(e){Q[e]=new W(e,6,!1,e,null,!1,!1)}),["rowSpan","start"].forEach(function(e){Q[e]=new W(e,5,!1,e.toLowerCase(),null,!1,!1)});var he=/[\-:]([a-z])/g;function ce(e){return e[1].toUpperCase()}"accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode xmlns:xlink x-height".split(" ").forEach(function(e){var t=e.replace(he,ce);Q[t]=new W(t,1,!1,e,null,!1,!1)}),"xlink:actuate xlink:arcrole xlink:role xlink:show xlink:title xlink:type".split(" ").forEach(function(e){var t=e.replace(he,ce);Q[t]=new W(t,1,!1,e,"http://www.w3.org/1999/xlink",!1,!1)}),["xml:base","xml:lang","xml:space"].forEach(function(e){var t=e.replace(he,ce);Q[t]=new W(t,1,!1,e,"http://www.w3.org/XML/1998/namespace",!1,!1)}),["tabIndex","crossOrigin"].forEach(function(e){Q[e]=new W(e,1,!1,e.toLowerCase(),null,!1,!1)}),Q.xlinkHref=new W("xlinkHref",1,!1,"xlink:href","http://www.w3.org/1999/xlink",!0,!1),["src","href","action","formAction"].forEach(function(e){Q[e]=new W(e,1,!1,e.toLowerCase(),null,!0,!0)});function me(e,t,n,r){var i=Q.hasOwnProperty(t)?Q[t]:null;(i!==null?i.type!==0:r||!(2<t.length)||t[0]!=="o"&&t[0]!=="O"||t[1]!=="n"&&t[1]!=="N")&&(P(t,n,i,r)&&(n=null),r||i===null?L(t)&&(n===null?e.removeAttribute(t):e.setAttribute(t,""+n)):i.mustUseProperty?e[i.propertyName]=n===null?i.type===3?!1:"":n:(t=i.attributeName,r=i.attributeNamespace,n===null?e.removeAttribute(t):(i=i.type,n=i===3||i===4&&n===!0?"":""+n,r?e.setAttributeNS(r,t,n):e.setAttribute(t,n))))}var oe=m.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,He=Symbol.for("react.element"),Ce=Symbol.for("react.portal"),Ae=Symbol.for("react.fragment"),A=Symbol.for("react.strict_mode"),ie=Symbol.for("react.profiler"),te=Symbol.for("react.provider"),ne=Symbol.for("react.context"),be=Symbol.for("react.forward_ref"),ue=Symbol.for("react.suspense"),Oe=Symbol.for("react.suspense_list"),Ve=Symbol.for("react.memo"),je=Symbol.for("react.lazy"),xe=Symbol.for("react.offscreen"),O=Symbol.iterator;function Y(e){return e===null||typeof e!="object"?null:(e=O&&e[O]||e["@@iterator"],typeof e=="function"?e:null)}var B=Object.assign,d;function w(e){if(d===void 0)try{throw Error()}catch(n){var t=n.stack.trim().match(/\n( *(at )?)/);d=t&&t[1]||""}return`
`+d+e}var J=!1;function C(e,t){if(!e||J)return"";J=!0;var n=Error.prepareStackTrace;Error.prepareStackTrace=void 0;try{if(t)if(t=function(){throw Error()},Object.defineProperty(t.prototype,"props",{set:function(){throw Error()}}),typeof Reflect=="object"&&Reflect.construct){try{Reflect.construct(t,[])}catch(g){var r=g}Reflect.construct(e,[],t)}else{try{t.call()}catch(g){r=g}e.call(t.prototype)}else{try{throw Error()}catch(g){r=g}e()}}catch(g){if(g&&r&&typeof g.stack=="string"){for(var i=g.stack.split(`
`),l=r.stack.split(`
`),a=i.length-1,s=l.length-1;1<=a&&0<=s&&i[a]!==l[s];)s--;for(;1<=a&&0<=s;a--,s--)if(i[a]!==l[s]){if(a!==1||s!==1)do if(a--,s--,0>s||i[a]!==l[s]){var c=`
`+i[a].replace(" at new "," at ");return e.displayName&&c.includes("<anonymous>")&&(c=c.replace("<anonymous>",e.displayName)),c}while(1<=a&&0<=s);break}}}finally{J=!1,Error.prepareStackTrace=n}return(e=e?e.displayName||e.name:"")?w(e):""}function F(e){switch(e.tag){case 5:return w(e.type);case 16:return w("Lazy");case 13:return w("Suspense");case 19:return w("SuspenseList");case 0:case 2:case 15:return e=C(e.type,!1),e;case 11:return e=C(e.type.render,!1),e;case 1:return e=C(e.type,!0),e;default:return""}}function Z(e){if(e==null)return null;if(typeof e=="function")return e.displayName||e.name||null;if(typeof e=="string")return e;switch(e){case Ae:return"Fragment";case Ce:return"Portal";case ie:return"Profiler";case A:return"StrictMode";case ue:return"Suspense";case Oe:return"SuspenseList"}if(typeof e=="object")switch(e.$$typeof){case ne:return(e.displayName||"Context")+".Consumer";case te:return(e._context.displayName||"Context")+".Provider";case be:var t=e.render;return e=e.displayName,e||(e=t.displayName||t.name||"",e=e!==""?"ForwardRef("+e+")":"ForwardRef"),e;case Ve:return t=e.displayName||null,t!==null?t:Z(e.type)||"Memo";case je:t=e._payload,e=e._init;try{return Z(e(t))}catch{}}return null}function le(e){var t=e.type;switch(e.tag){case 24:return"Cache";case 9:return(t.displayName||"Context")+".Consumer";case 10:return(t._context.displayName||"Context")+".Provider";case 18:return"DehydratedFragment";case 11:return e=t.render,e=e.displayName||e.name||"",t.displayName||(e!==""?"ForwardRef("+e+")":"ForwardRef");case 7:return"Fragment";case 5:return t;case 4:return"Portal";case 3:return"Root";case 6:return"Text";case 16:return Z(t);case 8:return t===A?"StrictMode":"Mode";case 22:return"Offscreen";case 12:return"Profiler";case 21:return"Scope";case 13:return"Suspense";case 19:return"SuspenseList";case 25:return"TracingMarker";case 1:case 0:case 17:case 2:case 14:case 15:if(typeof t=="function")return t.displayName||t.name||null;if(typeof t=="string")return t}return null}function ee(e){switch(typeof e){case"boolean":case"number":case"string":case"undefined":return e;case"object":return e;default:return""}}function pe(e){var t=e.type;return(e=e.nodeName)&&e.toLowerCase()==="input"&&(t==="checkbox"||t==="radio")}function Le(e){var t=pe(e)?"checked":"value",n=Object.getOwnPropertyDescriptor(e.constructor.prototype,t),r=""+e[t];if(!e.hasOwnProperty(t)&&typeof n<"u"&&typeof n.get=="function"&&typeof n.set=="function"){var i=n.get,l=n.set;return Object.defineProperty(e,t,{configurable:!0,get:function(){return i.call(this)},set:function(a){r=""+a,l.call(this,a)}}),Object.defineProperty(e,t,{enumerable:n.enumerable}),{getValue:function(){return r},setValue:function(a){r=""+a},stopTracking:function(){e._valueTracker=null,delete e[t]}}}}function Dt(e){e._valueTracker||(e._valueTracker=Le(e))}function at(e){if(!e)return!1;var t=e._valueTracker;if(!t)return!0;var n=t.getValue(),r="";return e&&(r=pe(e)?e.checked?"true":"false":e.value),e=r,e!==n?(t.setValue(e),!0):!1}function et(e){if(e=e||(typeof document<"u"?document:void 0),typeof e>"u")return null;try{return e.activeElement||e.body}catch{return e.body}}function mn(e,t){var n=t.checked;return B({},t,{defaultChecked:void 0,defaultValue:void 0,value:void 0,checked:n??e._wrapperState.initialChecked})}function tt(e,t){var n=t.defaultValue==null?"":t.defaultValue,r=t.checked!=null?t.checked:t.defaultChecked;n=ee(t.value!=null?t.value:n),e._wrapperState={initialChecked:r,initialValue:n,controlled:t.type==="checkbox"||t.type==="radio"?t.checked!=null:t.value!=null}}function Tt(e,t){t=t.checked,t!=null&&me(e,"checked",t,!1)}function Gn(e,t){Tt(e,t);var n=ee(t.value),r=t.type;if(n!=null)r==="number"?(n===0&&e.value===""||e.value!=n)&&(e.value=""+n):e.value!==""+n&&(e.value=""+n);else if(r==="submit"||r==="reset"){e.removeAttribute("value");return}t.hasOwnProperty("value")?Pt(e,t.type,n):t.hasOwnProperty("defaultValue")&&Pt(e,t.type,ee(t.defaultValue)),t.checked==null&&t.defaultChecked!=null&&(e.defaultChecked=!!t.defaultChecked)}function Ir(e,t,n){if(t.hasOwnProperty("value")||t.hasOwnProperty("defaultValue")){var r=t.type;if(!(r!=="submit"&&r!=="reset"||t.value!==void 0&&t.value!==null))return;t=""+e._wrapperState.initialValue,n||t===e.value||(e.value=t),e.defaultValue=t}n=e.name,n!==""&&(e.name=""),e.defaultChecked=!!e._wrapperState.initialChecked,n!==""&&(e.name=n)}function Pt(e,t,n){(t!=="number"||et(e.ownerDocument)!==e)&&(n==null?e.defaultValue=""+e._wrapperState.initialValue:e.defaultValue!==""+n&&(e.defaultValue=""+n))}var Fn=Array.isArray;function yn(e,t,n,r){if(e=e.options,t){t={};for(var i=0;i<n.length;i++)t["$"+n[i]]=!0;for(n=0;n<e.length;n++)i=t.hasOwnProperty("$"+e[n].value),e[n].selected!==i&&(e[n].selected=i),i&&r&&(e[n].defaultSelected=!0)}else{for(n=""+ee(n),t=null,i=0;i<e.length;i++){if(e[i].value===n){e[i].selected=!0,r&&(e[i].defaultSelected=!0);return}t!==null||e[i].disabled||(t=e[i])}t!==null&&(t.selected=!0)}}function Fi(e,t){if(t.dangerouslySetInnerHTML!=null)throw Error(o(91));return B({},t,{value:void 0,defaultValue:void 0,children:""+e._wrapperState.initialValue})}function $a(e,t){var n=t.value;if(n==null){if(n=t.children,t=t.defaultValue,n!=null){if(t!=null)throw Error(o(92));if(Fn(n)){if(1<n.length)throw Error(o(93));n=n[0]}t=n}t==null&&(t=""),n=t}e._wrapperState={initialValue:ee(n)}}function Ka(e,t){var n=ee(t.value),r=ee(t.defaultValue);n!=null&&(n=""+n,n!==e.value&&(e.value=n),t.defaultValue==null&&e.defaultValue!==n&&(e.defaultValue=n)),r!=null&&(e.defaultValue=""+r)}function Va(e){var t=e.textContent;t===e._wrapperState.initialValue&&t!==""&&t!==null&&(e.value=t)}function Ya(e){switch(e){case"svg":return"http://www.w3.org/2000/svg";case"math":return"http://www.w3.org/1998/Math/MathML";default:return"http://www.w3.org/1999/xhtml"}}function Hi(e,t){return e==null||e==="http://www.w3.org/1999/xhtml"?Ya(t):e==="http://www.w3.org/2000/svg"&&t==="foreignObject"?"http://www.w3.org/1999/xhtml":e}var _r,qa=(function(e){return typeof MSApp<"u"&&MSApp.execUnsafeLocalFunction?function(t,n,r,i){MSApp.execUnsafeLocalFunction(function(){return e(t,n,r,i)})}:e})(function(e,t){if(e.namespaceURI!=="http://www.w3.org/2000/svg"||"innerHTML"in e)e.innerHTML=t;else{for(_r=_r||document.createElement("div"),_r.innerHTML="<svg>"+t.valueOf().toString()+"</svg>",t=_r.firstChild;e.firstChild;)e.removeChild(e.firstChild);for(;t.firstChild;)e.appendChild(t.firstChild)}});function Hn(e,t){if(t){var n=e.firstChild;if(n&&n===e.lastChild&&n.nodeType===3){n.nodeValue=t;return}}e.textContent=t}var $n={animationIterationCount:!0,aspectRatio:!0,borderImageOutset:!0,borderImageSlice:!0,borderImageWidth:!0,boxFlex:!0,boxFlexGroup:!0,boxOrdinalGroup:!0,columnCount:!0,columns:!0,flex:!0,flexGrow:!0,flexPositive:!0,flexShrink:!0,flexNegative:!0,flexOrder:!0,gridArea:!0,gridRow:!0,gridRowEnd:!0,gridRowSpan:!0,gridRowStart:!0,gridColumn:!0,gridColumnEnd:!0,gridColumnSpan:!0,gridColumnStart:!0,fontWeight:!0,lineClamp:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,tabSize:!0,widows:!0,zIndex:!0,zoom:!0,fillOpacity:!0,floodOpacity:!0,stopOpacity:!0,strokeDasharray:!0,strokeDashoffset:!0,strokeMiterlimit:!0,strokeOpacity:!0,strokeWidth:!0},rc=["Webkit","ms","Moz","O"];Object.keys($n).forEach(function(e){rc.forEach(function(t){t=t+e.charAt(0).toUpperCase()+e.substring(1),$n[t]=$n[e]})});function Qa(e,t,n){return t==null||typeof t=="boolean"||t===""?"":n||typeof t!="number"||t===0||$n.hasOwnProperty(e)&&$n[e]?(""+t).trim():t+"px"}function Xa(e,t){e=e.style;for(var n in t)if(t.hasOwnProperty(n)){var r=n.indexOf("--")===0,i=Qa(n,t[n],r);n==="float"&&(n="cssFloat"),r?e.setProperty(n,i):e[n]=i}}var ic=B({menuitem:!0},{area:!0,base:!0,br:!0,col:!0,embed:!0,hr:!0,img:!0,input:!0,keygen:!0,link:!0,meta:!0,param:!0,source:!0,track:!0,wbr:!0});function $i(e,t){if(t){if(ic[e]&&(t.children!=null||t.dangerouslySetInnerHTML!=null))throw Error(o(137,e));if(t.dangerouslySetInnerHTML!=null){if(t.children!=null)throw Error(o(60));if(typeof t.dangerouslySetInnerHTML!="object"||!("__html"in t.dangerouslySetInnerHTML))throw Error(o(61))}if(t.style!=null&&typeof t.style!="object")throw Error(o(62))}}function Ki(e,t){if(e.indexOf("-")===-1)return typeof t.is=="string";switch(e){case"annotation-xml":case"color-profile":case"font-face":case"font-face-src":case"font-face-uri":case"font-face-format":case"font-face-name":case"missing-glyph":return!1;default:return!0}}var Vi=null;function Yi(e){return e=e.target||e.srcElement||window,e.correspondingUseElement&&(e=e.correspondingUseElement),e.nodeType===3?e.parentNode:e}var qi=null,vn=null,xn=null;function Za(e){if(e=fr(e)){if(typeof qi!="function")throw Error(o(280));var t=e.stateNode;t&&(t=ti(t),qi(e.stateNode,e.type,t))}}function Ja(e){vn?xn?xn.push(e):xn=[e]:vn=e}function eo(){if(vn){var e=vn,t=xn;if(xn=vn=null,Za(e),t)for(e=0;e<t.length;e++)Za(t[e])}}function to(e,t){return e(t)}function no(){}var Qi=!1;function ro(e,t,n){if(Qi)return e(t,n);Qi=!0;try{return to(e,t,n)}finally{Qi=!1,(vn!==null||xn!==null)&&(no(),eo())}}function Kn(e,t){var n=e.stateNode;if(n===null)return null;var r=ti(n);if(r===null)return null;n=r[t];e:switch(t){case"onClick":case"onClickCapture":case"onDoubleClick":case"onDoubleClickCapture":case"onMouseDown":case"onMouseDownCapture":case"onMouseMove":case"onMouseMoveCapture":case"onMouseUp":case"onMouseUpCapture":case"onMouseEnter":(r=!r.disabled)||(e=e.type,r=!(e==="button"||e==="input"||e==="select"||e==="textarea")),e=!r;break e;default:e=!1}if(e)return null;if(n&&typeof n!="function")throw Error(o(231,t,typeof n));return n}var Xi=!1;if(z)try{var Vn={};Object.defineProperty(Vn,"passive",{get:function(){Xi=!0}}),window.addEventListener("test",Vn,Vn),window.removeEventListener("test",Vn,Vn)}catch{Xi=!1}function lc(e,t,n,r,i,l,a,s,c){var g=Array.prototype.slice.call(arguments,3);try{t.apply(n,g)}catch(S){this.onError(S)}}var Yn=!1,Lr=null,Br=!1,Zi=null,ac={onError:function(e){Yn=!0,Lr=e}};function oc(e,t,n,r,i,l,a,s,c){Yn=!1,Lr=null,lc.apply(ac,arguments)}function sc(e,t,n,r,i,l,a,s,c){if(oc.apply(this,arguments),Yn){if(Yn){var g=Lr;Yn=!1,Lr=null}else throw Error(o(198));Br||(Br=!0,Zi=g)}}function nn(e){var t=e,n=e;if(e.alternate)for(;t.return;)t=t.return;else{e=t;do t=e,(t.flags&4098)!==0&&(n=t.return),e=t.return;while(e)}return t.tag===3?n:null}function io(e){if(e.tag===13){var t=e.memoizedState;if(t===null&&(e=e.alternate,e!==null&&(t=e.memoizedState)),t!==null)return t.dehydrated}return null}function lo(e){if(nn(e)!==e)throw Error(o(188))}function uc(e){var t=e.alternate;if(!t){if(t=nn(e),t===null)throw Error(o(188));return t!==e?null:e}for(var n=e,r=t;;){var i=n.return;if(i===null)break;var l=i.alternate;if(l===null){if(r=i.return,r!==null){n=r;continue}break}if(i.child===l.child){for(l=i.child;l;){if(l===n)return lo(i),e;if(l===r)return lo(i),t;l=l.sibling}throw Error(o(188))}if(n.return!==r.return)n=i,r=l;else{for(var a=!1,s=i.child;s;){if(s===n){a=!0,n=i,r=l;break}if(s===r){a=!0,r=i,n=l;break}s=s.sibling}if(!a){for(s=l.child;s;){if(s===n){a=!0,n=l,r=i;break}if(s===r){a=!0,r=l,n=i;break}s=s.sibling}if(!a)throw Error(o(189))}}if(n.alternate!==r)throw Error(o(190))}if(n.tag!==3)throw Error(o(188));return n.stateNode.current===n?e:t}function ao(e){return e=uc(e),e!==null?oo(e):null}function oo(e){if(e.tag===5||e.tag===6)return e;for(e=e.child;e!==null;){var t=oo(e);if(t!==null)return t;e=e.sibling}return null}var so=y.unstable_scheduleCallback,uo=y.unstable_cancelCallback,cc=y.unstable_shouldYield,pc=y.unstable_requestPaint,Re=y.unstable_now,dc=y.unstable_getCurrentPriorityLevel,Ji=y.unstable_ImmediatePriority,co=y.unstable_UserBlockingPriority,Dr=y.unstable_NormalPriority,fc=y.unstable_LowPriority,po=y.unstable_IdlePriority,Pr=null,Et=null;function hc(e){if(Et&&typeof Et.onCommitFiberRoot=="function")try{Et.onCommitFiberRoot(Pr,e,void 0,(e.current.flags&128)===128)}catch{}}var ft=Math.clz32?Math.clz32:yc,gc=Math.log,mc=Math.LN2;function yc(e){return e>>>=0,e===0?32:31-(gc(e)/mc|0)|0}var Mr=64,Wr=4194304;function qn(e){switch(e&-e){case 1:return 1;case 2:return 2;case 4:return 4;case 8:return 8;case 16:return 16;case 32:return 32;case 64:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:return e&4194240;case 4194304:case 8388608:case 16777216:case 33554432:case 67108864:return e&130023424;case 134217728:return 134217728;case 268435456:return 268435456;case 536870912:return 536870912;case 1073741824:return 1073741824;default:return e}}function jr(e,t){var n=e.pendingLanes;if(n===0)return 0;var r=0,i=e.suspendedLanes,l=e.pingedLanes,a=n&268435455;if(a!==0){var s=a&~i;s!==0?r=qn(s):(l&=a,l!==0&&(r=qn(l)))}else a=n&~i,a!==0?r=qn(a):l!==0&&(r=qn(l));if(r===0)return 0;if(t!==0&&t!==r&&(t&i)===0&&(i=r&-r,l=t&-t,i>=l||i===16&&(l&4194240)!==0))return t;if((r&4)!==0&&(r|=n&16),t=e.entangledLanes,t!==0)for(e=e.entanglements,t&=r;0<t;)n=31-ft(t),i=1<<n,r|=e[n],t&=~i;return r}function vc(e,t){switch(e){case 1:case 2:case 4:return t+250;case 8:case 16:case 32:case 64:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:return t+5e3;case 4194304:case 8388608:case 16777216:case 33554432:case 67108864:return-1;case 134217728:case 268435456:case 536870912:case 1073741824:return-1;default:return-1}}function xc(e,t){for(var n=e.suspendedLanes,r=e.pingedLanes,i=e.expirationTimes,l=e.pendingLanes;0<l;){var a=31-ft(l),s=1<<a,c=i[a];c===-1?((s&n)===0||(s&r)!==0)&&(i[a]=vc(s,t)):c<=t&&(e.expiredLanes|=s),l&=~s}}function el(e){return e=e.pendingLanes&-1073741825,e!==0?e:e&1073741824?1073741824:0}function fo(){var e=Mr;return Mr<<=1,(Mr&4194240)===0&&(Mr=64),e}function tl(e){for(var t=[],n=0;31>n;n++)t.push(e);return t}function Qn(e,t,n){e.pendingLanes|=t,t!==536870912&&(e.suspendedLanes=0,e.pingedLanes=0),e=e.eventTimes,t=31-ft(t),e[t]=n}function wc(e,t){var n=e.pendingLanes&~t;e.pendingLanes=t,e.suspendedLanes=0,e.pingedLanes=0,e.expiredLanes&=t,e.mutableReadLanes&=t,e.entangledLanes&=t,t=e.entanglements;var r=e.eventTimes;for(e=e.expirationTimes;0<n;){var i=31-ft(n),l=1<<i;t[i]=0,r[i]=-1,e[i]=-1,n&=~l}}function nl(e,t){var n=e.entangledLanes|=t;for(e=e.entanglements;n;){var r=31-ft(n),i=1<<r;i&t|e[r]&t&&(e[r]|=t),n&=~i}}var de=0;function ho(e){return e&=-e,1<e?4<e?(e&268435455)!==0?16:536870912:4:1}var go,rl,mo,yo,vo,il=!1,zr=[],Mt=null,Wt=null,jt=null,Xn=new Map,Zn=new Map,zt=[],Ec="mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset submit".split(" ");function xo(e,t){switch(e){case"focusin":case"focusout":Mt=null;break;case"dragenter":case"dragleave":Wt=null;break;case"mouseover":case"mouseout":jt=null;break;case"pointerover":case"pointerout":Xn.delete(t.pointerId);break;case"gotpointercapture":case"lostpointercapture":Zn.delete(t.pointerId)}}function Jn(e,t,n,r,i,l){return e===null||e.nativeEvent!==l?(e={blockedOn:t,domEventName:n,eventSystemFlags:r,nativeEvent:l,targetContainers:[i]},t!==null&&(t=fr(t),t!==null&&rl(t)),e):(e.eventSystemFlags|=r,t=e.targetContainers,i!==null&&t.indexOf(i)===-1&&t.push(i),e)}function Sc(e,t,n,r,i){switch(t){case"focusin":return Mt=Jn(Mt,e,t,n,r,i),!0;case"dragenter":return Wt=Jn(Wt,e,t,n,r,i),!0;case"mouseover":return jt=Jn(jt,e,t,n,r,i),!0;case"pointerover":var l=i.pointerId;return Xn.set(l,Jn(Xn.get(l)||null,e,t,n,r,i)),!0;case"gotpointercapture":return l=i.pointerId,Zn.set(l,Jn(Zn.get(l)||null,e,t,n,r,i)),!0}return!1}function wo(e){var t=rn(e.target);if(t!==null){var n=nn(t);if(n!==null){if(t=n.tag,t===13){if(t=io(n),t!==null){e.blockedOn=t,vo(e.priority,function(){mo(n)});return}}else if(t===3&&n.stateNode.current.memoizedState.isDehydrated){e.blockedOn=n.tag===3?n.stateNode.containerInfo:null;return}}}e.blockedOn=null}function Ur(e){if(e.blockedOn!==null)return!1;for(var t=e.targetContainers;0<t.length;){var n=al(e.domEventName,e.eventSystemFlags,t[0],e.nativeEvent);if(n===null){n=e.nativeEvent;var r=new n.constructor(n.type,n);Vi=r,n.target.dispatchEvent(r),Vi=null}else return t=fr(n),t!==null&&rl(t),e.blockedOn=n,!1;t.shift()}return!0}function Eo(e,t,n){Ur(e)&&n.delete(t)}function kc(){il=!1,Mt!==null&&Ur(Mt)&&(Mt=null),Wt!==null&&Ur(Wt)&&(Wt=null),jt!==null&&Ur(jt)&&(jt=null),Xn.forEach(Eo),Zn.forEach(Eo)}function er(e,t){e.blockedOn===t&&(e.blockedOn=null,il||(il=!0,y.unstable_scheduleCallback(y.unstable_NormalPriority,kc)))}function tr(e){function t(i){return er(i,e)}if(0<zr.length){er(zr[0],e);for(var n=1;n<zr.length;n++){var r=zr[n];r.blockedOn===e&&(r.blockedOn=null)}}for(Mt!==null&&er(Mt,e),Wt!==null&&er(Wt,e),jt!==null&&er(jt,e),Xn.forEach(t),Zn.forEach(t),n=0;n<zt.length;n++)r=zt[n],r.blockedOn===e&&(r.blockedOn=null);for(;0<zt.length&&(n=zt[0],n.blockedOn===null);)wo(n),n.blockedOn===null&&zt.shift()}var wn=oe.ReactCurrentBatchConfig,Gr=!0;function Cc(e,t,n,r){var i=de,l=wn.transition;wn.transition=null;try{de=1,ll(e,t,n,r)}finally{de=i,wn.transition=l}}function Rc(e,t,n,r){var i=de,l=wn.transition;wn.transition=null;try{de=4,ll(e,t,n,r)}finally{de=i,wn.transition=l}}function ll(e,t,n,r){if(Gr){var i=al(e,t,n,r);if(i===null)kl(e,t,r,Fr,n),xo(e,r);else if(Sc(i,e,t,n,r))r.stopPropagation();else if(xo(e,r),t&4&&-1<Ec.indexOf(e)){for(;i!==null;){var l=fr(i);if(l!==null&&go(l),l=al(e,t,n,r),l===null&&kl(e,t,r,Fr,n),l===i)break;i=l}i!==null&&r.stopPropagation()}else kl(e,t,r,null,n)}}var Fr=null;function al(e,t,n,r){if(Fr=null,e=Yi(r),e=rn(e),e!==null)if(t=nn(e),t===null)e=null;else if(n=t.tag,n===13){if(e=io(t),e!==null)return e;e=null}else if(n===3){if(t.stateNode.current.memoizedState.isDehydrated)return t.tag===3?t.stateNode.containerInfo:null;e=null}else t!==e&&(e=null);return Fr=e,null}function So(e){switch(e){case"cancel":case"click":case"close":case"contextmenu":case"copy":case"cut":case"auxclick":case"dblclick":case"dragend":case"dragstart":case"drop":case"focusin":case"focusout":case"input":case"invalid":case"keydown":case"keypress":case"keyup":case"mousedown":case"mouseup":case"paste":case"pause":case"play":case"pointercancel":case"pointerdown":case"pointerup":case"ratechange":case"reset":case"resize":case"seeked":case"submit":case"touchcancel":case"touchend":case"touchstart":case"volumechange":case"change":case"selectionchange":case"textInput":case"compositionstart":case"compositionend":case"compositionupdate":case"beforeblur":case"afterblur":case"beforeinput":case"blur":case"fullscreenchange":case"focus":case"hashchange":case"popstate":case"select":case"selectstart":return 1;case"drag":case"dragenter":case"dragexit":case"dragleave":case"dragover":case"mousemove":case"mouseout":case"mouseover":case"pointermove":case"pointerout":case"pointerover":case"scroll":case"toggle":case"touchmove":case"wheel":case"mouseenter":case"mouseleave":case"pointerenter":case"pointerleave":return 4;case"message":switch(dc()){case Ji:return 1;case co:return 4;case Dr:case fc:return 16;case po:return 536870912;default:return 16}default:return 16}}var Ut=null,ol=null,Hr=null;function ko(){if(Hr)return Hr;var e,t=ol,n=t.length,r,i="value"in Ut?Ut.value:Ut.textContent,l=i.length;for(e=0;e<n&&t[e]===i[e];e++);var a=n-e;for(r=1;r<=a&&t[n-r]===i[l-r];r++);return Hr=i.slice(e,1<r?1-r:void 0)}function $r(e){var t=e.keyCode;return"charCode"in e?(e=e.charCode,e===0&&t===13&&(e=13)):e=t,e===10&&(e=13),32<=e||e===13?e:0}function Kr(){return!0}function Co(){return!1}function nt(e){function t(n,r,i,l,a){this._reactName=n,this._targetInst=i,this.type=r,this.nativeEvent=l,this.target=a,this.currentTarget=null;for(var s in e)e.hasOwnProperty(s)&&(n=e[s],this[s]=n?n(l):l[s]);return this.isDefaultPrevented=(l.defaultPrevented!=null?l.defaultPrevented:l.returnValue===!1)?Kr:Co,this.isPropagationStopped=Co,this}return B(t.prototype,{preventDefault:function(){this.defaultPrevented=!0;var n=this.nativeEvent;n&&(n.preventDefault?n.preventDefault():typeof n.returnValue!="unknown"&&(n.returnValue=!1),this.isDefaultPrevented=Kr)},stopPropagation:function(){var n=this.nativeEvent;n&&(n.stopPropagation?n.stopPropagation():typeof n.cancelBubble!="unknown"&&(n.cancelBubble=!0),this.isPropagationStopped=Kr)},persist:function(){},isPersistent:Kr}),t}var En={eventPhase:0,bubbles:0,cancelable:0,timeStamp:function(e){return e.timeStamp||Date.now()},defaultPrevented:0,isTrusted:0},sl=nt(En),nr=B({},En,{view:0,detail:0}),Tc=nt(nr),ul,cl,rr,Vr=B({},nr,{screenX:0,screenY:0,clientX:0,clientY:0,pageX:0,pageY:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,getModifierState:dl,button:0,buttons:0,relatedTarget:function(e){return e.relatedTarget===void 0?e.fromElement===e.srcElement?e.toElement:e.fromElement:e.relatedTarget},movementX:function(e){return"movementX"in e?e.movementX:(e!==rr&&(rr&&e.type==="mousemove"?(ul=e.screenX-rr.screenX,cl=e.screenY-rr.screenY):cl=ul=0,rr=e),ul)},movementY:function(e){return"movementY"in e?e.movementY:cl}}),Ro=nt(Vr),bc=B({},Vr,{dataTransfer:0}),Nc=nt(bc),Ac=B({},nr,{relatedTarget:0}),pl=nt(Ac),Oc=B({},En,{animationName:0,elapsedTime:0,pseudoElement:0}),Ic=nt(Oc),_c=B({},En,{clipboardData:function(e){return"clipboardData"in e?e.clipboardData:window.clipboardData}}),Lc=nt(_c),Bc=B({},En,{data:0}),To=nt(Bc),Dc={Esc:"Escape",Spacebar:" ",Left:"ArrowLeft",Up:"ArrowUp",Right:"ArrowRight",Down:"ArrowDown",Del:"Delete",Win:"OS",Menu:"ContextMenu",Apps:"ContextMenu",Scroll:"ScrollLock",MozPrintableKey:"Unidentified"},Pc={8:"Backspace",9:"Tab",12:"Clear",13:"Enter",16:"Shift",17:"Control",18:"Alt",19:"Pause",20:"CapsLock",27:"Escape",32:" ",33:"PageUp",34:"PageDown",35:"End",36:"Home",37:"ArrowLeft",38:"ArrowUp",39:"ArrowRight",40:"ArrowDown",45:"Insert",46:"Delete",112:"F1",113:"F2",114:"F3",115:"F4",116:"F5",117:"F6",118:"F7",119:"F8",120:"F9",121:"F10",122:"F11",123:"F12",144:"NumLock",145:"ScrollLock",224:"Meta"},Mc={Alt:"altKey",Control:"ctrlKey",Meta:"metaKey",Shift:"shiftKey"};function Wc(e){var t=this.nativeEvent;return t.getModifierState?t.getModifierState(e):(e=Mc[e])?!!t[e]:!1}function dl(){return Wc}var jc=B({},nr,{key:function(e){if(e.key){var t=Dc[e.key]||e.key;if(t!=="Unidentified")return t}return e.type==="keypress"?(e=$r(e),e===13?"Enter":String.fromCharCode(e)):e.type==="keydown"||e.type==="keyup"?Pc[e.keyCode]||"Unidentified":""},code:0,location:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,repeat:0,locale:0,getModifierState:dl,charCode:function(e){return e.type==="keypress"?$r(e):0},keyCode:function(e){return e.type==="keydown"||e.type==="keyup"?e.keyCode:0},which:function(e){return e.type==="keypress"?$r(e):e.type==="keydown"||e.type==="keyup"?e.keyCode:0}}),zc=nt(jc),Uc=B({},Vr,{pointerId:0,width:0,height:0,pressure:0,tangentialPressure:0,tiltX:0,tiltY:0,twist:0,pointerType:0,isPrimary:0}),bo=nt(Uc),Gc=B({},nr,{touches:0,targetTouches:0,changedTouches:0,altKey:0,metaKey:0,ctrlKey:0,shiftKey:0,getModifierState:dl}),Fc=nt(Gc),Hc=B({},En,{propertyName:0,elapsedTime:0,pseudoElement:0}),$c=nt(Hc),Kc=B({},Vr,{deltaX:function(e){return"deltaX"in e?e.deltaX:"wheelDeltaX"in e?-e.wheelDeltaX:0},deltaY:function(e){return"deltaY"in e?e.deltaY:"wheelDeltaY"in e?-e.wheelDeltaY:"wheelDelta"in e?-e.wheelDelta:0},deltaZ:0,deltaMode:0}),Vc=nt(Kc),Yc=[9,13,27,32],fl=z&&"CompositionEvent"in window,ir=null;z&&"documentMode"in document&&(ir=document.documentMode);var qc=z&&"TextEvent"in window&&!ir,No=z&&(!fl||ir&&8<ir&&11>=ir),Ao=" ",Oo=!1;function Io(e,t){switch(e){case"keyup":return Yc.indexOf(t.keyCode)!==-1;case"keydown":return t.keyCode!==229;case"keypress":case"mousedown":case"focusout":return!0;default:return!1}}function _o(e){return e=e.detail,typeof e=="object"&&"data"in e?e.data:null}var Sn=!1;function Qc(e,t){switch(e){case"compositionend":return _o(t);case"keypress":return t.which!==32?null:(Oo=!0,Ao);case"textInput":return e=t.data,e===Ao&&Oo?null:e;default:return null}}function Xc(e,t){if(Sn)return e==="compositionend"||!fl&&Io(e,t)?(e=ko(),Hr=ol=Ut=null,Sn=!1,e):null;switch(e){case"paste":return null;case"keypress":if(!(t.ctrlKey||t.altKey||t.metaKey)||t.ctrlKey&&t.altKey){if(t.char&&1<t.char.length)return t.char;if(t.which)return String.fromCharCode(t.which)}return null;case"compositionend":return No&&t.locale!=="ko"?null:t.data;default:return null}}var Zc={color:!0,date:!0,datetime:!0,"datetime-local":!0,email:!0,month:!0,number:!0,password:!0,range:!0,search:!0,tel:!0,text:!0,time:!0,url:!0,week:!0};function Lo(e){var t=e&&e.nodeName&&e.nodeName.toLowerCase();return t==="input"?!!Zc[e.type]:t==="textarea"}function Bo(e,t,n,r){Ja(r),t=Zr(t,"onChange"),0<t.length&&(n=new sl("onChange","change",null,n,r),e.push({event:n,listeners:t}))}var lr=null,ar=null;function Jc(e){Zo(e,0)}function Yr(e){var t=bn(e);if(at(t))return e}function ep(e,t){if(e==="change")return t}var Do=!1;if(z){var hl;if(z){var gl="oninput"in document;if(!gl){var Po=document.createElement("div");Po.setAttribute("oninput","return;"),gl=typeof Po.oninput=="function"}hl=gl}else hl=!1;Do=hl&&(!document.documentMode||9<document.documentMode)}function Mo(){lr&&(lr.detachEvent("onpropertychange",Wo),ar=lr=null)}function Wo(e){if(e.propertyName==="value"&&Yr(ar)){var t=[];Bo(t,ar,e,Yi(e)),ro(Jc,t)}}function tp(e,t,n){e==="focusin"?(Mo(),lr=t,ar=n,lr.attachEvent("onpropertychange",Wo)):e==="focusout"&&Mo()}function np(e){if(e==="selectionchange"||e==="keyup"||e==="keydown")return Yr(ar)}function rp(e,t){if(e==="click")return Yr(t)}function ip(e,t){if(e==="input"||e==="change")return Yr(t)}function lp(e,t){return e===t&&(e!==0||1/e===1/t)||e!==e&&t!==t}var ht=typeof Object.is=="function"?Object.is:lp;function or(e,t){if(ht(e,t))return!0;if(typeof e!="object"||e===null||typeof t!="object"||t===null)return!1;var n=Object.keys(e),r=Object.keys(t);if(n.length!==r.length)return!1;for(r=0;r<n.length;r++){var i=n[r];if(!N.call(t,i)||!ht(e[i],t[i]))return!1}return!0}function jo(e){for(;e&&e.firstChild;)e=e.firstChild;return e}function zo(e,t){var n=jo(e);e=0;for(var r;n;){if(n.nodeType===3){if(r=e+n.textContent.length,e<=t&&r>=t)return{node:n,offset:t-e};e=r}e:{for(;n;){if(n.nextSibling){n=n.nextSibling;break e}n=n.parentNode}n=void 0}n=jo(n)}}function Uo(e,t){return e&&t?e===t?!0:e&&e.nodeType===3?!1:t&&t.nodeType===3?Uo(e,t.parentNode):"contains"in e?e.contains(t):e.compareDocumentPosition?!!(e.compareDocumentPosition(t)&16):!1:!1}function Go(){for(var e=window,t=et();t instanceof e.HTMLIFrameElement;){try{var n=typeof t.contentWindow.location.href=="string"}catch{n=!1}if(n)e=t.contentWindow;else break;t=et(e.document)}return t}function ml(e){var t=e&&e.nodeName&&e.nodeName.toLowerCase();return t&&(t==="input"&&(e.type==="text"||e.type==="search"||e.type==="tel"||e.type==="url"||e.type==="password")||t==="textarea"||e.contentEditable==="true")}function ap(e){var t=Go(),n=e.focusedElem,r=e.selectionRange;if(t!==n&&n&&n.ownerDocument&&Uo(n.ownerDocument.documentElement,n)){if(r!==null&&ml(n)){if(t=r.start,e=r.end,e===void 0&&(e=t),"selectionStart"in n)n.selectionStart=t,n.selectionEnd=Math.min(e,n.value.length);else if(e=(t=n.ownerDocument||document)&&t.defaultView||window,e.getSelection){e=e.getSelection();var i=n.textContent.length,l=Math.min(r.start,i);r=r.end===void 0?l:Math.min(r.end,i),!e.extend&&l>r&&(i=r,r=l,l=i),i=zo(n,l);var a=zo(n,r);i&&a&&(e.rangeCount!==1||e.anchorNode!==i.node||e.anchorOffset!==i.offset||e.focusNode!==a.node||e.focusOffset!==a.offset)&&(t=t.createRange(),t.setStart(i.node,i.offset),e.removeAllRanges(),l>r?(e.addRange(t),e.extend(a.node,a.offset)):(t.setEnd(a.node,a.offset),e.addRange(t)))}}for(t=[],e=n;e=e.parentNode;)e.nodeType===1&&t.push({element:e,left:e.scrollLeft,top:e.scrollTop});for(typeof n.focus=="function"&&n.focus(),n=0;n<t.length;n++)e=t[n],e.element.scrollLeft=e.left,e.element.scrollTop=e.top}}var op=z&&"documentMode"in document&&11>=document.documentMode,kn=null,yl=null,sr=null,vl=!1;function Fo(e,t,n){var r=n.window===n?n.document:n.nodeType===9?n:n.ownerDocument;vl||kn==null||kn!==et(r)||(r=kn,"selectionStart"in r&&ml(r)?r={start:r.selectionStart,end:r.selectionEnd}:(r=(r.ownerDocument&&r.ownerDocument.defaultView||window).getSelection(),r={anchorNode:r.anchorNode,anchorOffset:r.anchorOffset,focusNode:r.focusNode,focusOffset:r.focusOffset}),sr&&or(sr,r)||(sr=r,r=Zr(yl,"onSelect"),0<r.length&&(t=new sl("onSelect","select",null,t,n),e.push({event:t,listeners:r}),t.target=kn)))}function qr(e,t){var n={};return n[e.toLowerCase()]=t.toLowerCase(),n["Webkit"+e]="webkit"+t,n["Moz"+e]="moz"+t,n}var Cn={animationend:qr("Animation","AnimationEnd"),animationiteration:qr("Animation","AnimationIteration"),animationstart:qr("Animation","AnimationStart"),transitionend:qr("Transition","TransitionEnd")},xl={},Ho={};z&&(Ho=document.createElement("div").style,"AnimationEvent"in window||(delete Cn.animationend.animation,delete Cn.animationiteration.animation,delete Cn.animationstart.animation),"TransitionEvent"in window||delete Cn.transitionend.transition);function Qr(e){if(xl[e])return xl[e];if(!Cn[e])return e;var t=Cn[e],n;for(n in t)if(t.hasOwnProperty(n)&&n in Ho)return xl[e]=t[n];return e}var $o=Qr("animationend"),Ko=Qr("animationiteration"),Vo=Qr("animationstart"),Yo=Qr("transitionend"),qo=new Map,Qo="abort auxClick cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");function Gt(e,t){qo.set(e,t),b(t,[e])}for(var wl=0;wl<Qo.length;wl++){var El=Qo[wl],sp=El.toLowerCase(),up=El[0].toUpperCase()+El.slice(1);Gt(sp,"on"+up)}Gt($o,"onAnimationEnd"),Gt(Ko,"onAnimationIteration"),Gt(Vo,"onAnimationStart"),Gt("dblclick","onDoubleClick"),Gt("focusin","onFocus"),Gt("focusout","onBlur"),Gt(Yo,"onTransitionEnd"),I("onMouseEnter",["mouseout","mouseover"]),I("onMouseLeave",["mouseout","mouseover"]),I("onPointerEnter",["pointerout","pointerover"]),I("onPointerLeave",["pointerout","pointerover"]),b("onChange","change click focusin focusout input keydown keyup selectionchange".split(" ")),b("onSelect","focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" ")),b("onBeforeInput",["compositionend","keypress","textInput","paste"]),b("onCompositionEnd","compositionend focusout keydown keypress keyup mousedown".split(" ")),b("onCompositionStart","compositionstart focusout keydown keypress keyup mousedown".split(" ")),b("onCompositionUpdate","compositionupdate focusout keydown keypress keyup mousedown".split(" "));var ur="abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "),cp=new Set("cancel close invalid load scroll toggle".split(" ").concat(ur));function Xo(e,t,n){var r=e.type||"unknown-event";e.currentTarget=n,sc(r,t,void 0,e),e.currentTarget=null}function Zo(e,t){t=(t&4)!==0;for(var n=0;n<e.length;n++){var r=e[n],i=r.event;r=r.listeners;e:{var l=void 0;if(t)for(var a=r.length-1;0<=a;a--){var s=r[a],c=s.instance,g=s.currentTarget;if(s=s.listener,c!==l&&i.isPropagationStopped())break e;Xo(i,s,g),l=c}else for(a=0;a<r.length;a++){if(s=r[a],c=s.instance,g=s.currentTarget,s=s.listener,c!==l&&i.isPropagationStopped())break e;Xo(i,s,g),l=c}}}if(Br)throw e=Zi,Br=!1,Zi=null,e}function ye(e,t){var n=t[Al];n===void 0&&(n=t[Al]=new Set);var r=e+"__bubble";n.has(r)||(Jo(t,e,2,!1),n.add(r))}function Sl(e,t,n){var r=0;t&&(r|=4),Jo(n,e,r,t)}var Xr="_reactListening"+Math.random().toString(36).slice(2);function cr(e){if(!e[Xr]){e[Xr]=!0,x.forEach(function(n){n!=="selectionchange"&&(cp.has(n)||Sl(n,!1,e),Sl(n,!0,e))});var t=e.nodeType===9?e:e.ownerDocument;t===null||t[Xr]||(t[Xr]=!0,Sl("selectionchange",!1,t))}}function Jo(e,t,n,r){switch(So(t)){case 1:var i=Cc;break;case 4:i=Rc;break;default:i=ll}n=i.bind(null,t,n,e),i=void 0,!Xi||t!=="touchstart"&&t!=="touchmove"&&t!=="wheel"||(i=!0),r?i!==void 0?e.addEventListener(t,n,{capture:!0,passive:i}):e.addEventListener(t,n,!0):i!==void 0?e.addEventListener(t,n,{passive:i}):e.addEventListener(t,n,!1)}function kl(e,t,n,r,i){var l=r;if((t&1)===0&&(t&2)===0&&r!==null)e:for(;;){if(r===null)return;var a=r.tag;if(a===3||a===4){var s=r.stateNode.containerInfo;if(s===i||s.nodeType===8&&s.parentNode===i)break;if(a===4)for(a=r.return;a!==null;){var c=a.tag;if((c===3||c===4)&&(c=a.stateNode.containerInfo,c===i||c.nodeType===8&&c.parentNode===i))return;a=a.return}for(;s!==null;){if(a=rn(s),a===null)return;if(c=a.tag,c===5||c===6){r=l=a;continue e}s=s.parentNode}}r=r.return}ro(function(){var g=l,S=Yi(n),k=[];e:{var E=qo.get(e);if(E!==void 0){var _=sl,M=e;switch(e){case"keypress":if($r(n)===0)break e;case"keydown":case"keyup":_=zc;break;case"focusin":M="focus",_=pl;break;case"focusout":M="blur",_=pl;break;case"beforeblur":case"afterblur":_=pl;break;case"click":if(n.button===2)break e;case"auxclick":case"dblclick":case"mousedown":case"mousemove":case"mouseup":case"mouseout":case"mouseover":case"contextmenu":_=Ro;break;case"drag":case"dragend":case"dragenter":case"dragexit":case"dragleave":case"dragover":case"dragstart":case"drop":_=Nc;break;case"touchcancel":case"touchend":case"touchmove":case"touchstart":_=Fc;break;case $o:case Ko:case Vo:_=Ic;break;case Yo:_=$c;break;case"scroll":_=Tc;break;case"wheel":_=Vc;break;case"copy":case"cut":case"paste":_=Lc;break;case"gotpointercapture":case"lostpointercapture":case"pointercancel":case"pointerdown":case"pointermove":case"pointerout":case"pointerover":case"pointerup":_=bo}var j=(t&4)!==0,Te=!j&&e==="scroll",f=j?E!==null?E+"Capture":null:E;j=[];for(var p=g,h;p!==null;){h=p;var R=h.stateNode;if(h.tag===5&&R!==null&&(h=R,f!==null&&(R=Kn(p,f),R!=null&&j.push(pr(p,R,h)))),Te)break;p=p.return}0<j.length&&(E=new _(E,M,null,n,S),k.push({event:E,listeners:j}))}}if((t&7)===0){e:{if(E=e==="mouseover"||e==="pointerover",_=e==="mouseout"||e==="pointerout",E&&n!==Vi&&(M=n.relatedTarget||n.fromElement)&&(rn(M)||M[bt]))break e;if((_||E)&&(E=S.window===S?S:(E=S.ownerDocument)?E.defaultView||E.parentWindow:window,_?(M=n.relatedTarget||n.toElement,_=g,M=M?rn(M):null,M!==null&&(Te=nn(M),M!==Te||M.tag!==5&&M.tag!==6)&&(M=null)):(_=null,M=g),_!==M)){if(j=Ro,R="onMouseLeave",f="onMouseEnter",p="mouse",(e==="pointerout"||e==="pointerover")&&(j=bo,R="onPointerLeave",f="onPointerEnter",p="pointer"),Te=_==null?E:bn(_),h=M==null?E:bn(M),E=new j(R,p+"leave",_,n,S),E.target=Te,E.relatedTarget=h,R=null,rn(S)===g&&(j=new j(f,p+"enter",M,n,S),j.target=h,j.relatedTarget=Te,R=j),Te=R,_&&M)t:{for(j=_,f=M,p=0,h=j;h;h=Rn(h))p++;for(h=0,R=f;R;R=Rn(R))h++;for(;0<p-h;)j=Rn(j),p--;for(;0<h-p;)f=Rn(f),h--;for(;p--;){if(j===f||f!==null&&j===f.alternate)break t;j=Rn(j),f=Rn(f)}j=null}else j=null;_!==null&&es(k,E,_,j,!1),M!==null&&Te!==null&&es(k,Te,M,j,!0)}}e:{if(E=g?bn(g):window,_=E.nodeName&&E.nodeName.toLowerCase(),_==="select"||_==="input"&&E.type==="file")var G=ep;else if(Lo(E))if(Do)G=ip;else{G=np;var K=tp}else(_=E.nodeName)&&_.toLowerCase()==="input"&&(E.type==="checkbox"||E.type==="radio")&&(G=rp);if(G&&(G=G(e,g))){Bo(k,G,n,S);break e}K&&K(e,E,g),e==="focusout"&&(K=E._wrapperState)&&K.controlled&&E.type==="number"&&Pt(E,"number",E.value)}switch(K=g?bn(g):window,e){case"focusin":(Lo(K)||K.contentEditable==="true")&&(kn=K,yl=g,sr=null);break;case"focusout":sr=yl=kn=null;break;case"mousedown":vl=!0;break;case"contextmenu":case"mouseup":case"dragend":vl=!1,Fo(k,n,S);break;case"selectionchange":if(op)break;case"keydown":case"keyup":Fo(k,n,S)}var V;if(fl)e:{switch(e){case"compositionstart":var X="onCompositionStart";break e;case"compositionend":X="onCompositionEnd";break e;case"compositionupdate":X="onCompositionUpdate";break e}X=void 0}else Sn?Io(e,n)&&(X="onCompositionEnd"):e==="keydown"&&n.keyCode===229&&(X="onCompositionStart");X&&(No&&n.locale!=="ko"&&(Sn||X!=="onCompositionStart"?X==="onCompositionEnd"&&Sn&&(V=ko()):(Ut=S,ol="value"in Ut?Ut.value:Ut.textContent,Sn=!0)),K=Zr(g,X),0<K.length&&(X=new To(X,e,null,n,S),k.push({event:X,listeners:K}),V?X.data=V:(V=_o(n),V!==null&&(X.data=V)))),(V=qc?Qc(e,n):Xc(e,n))&&(g=Zr(g,"onBeforeInput"),0<g.length&&(S=new To("onBeforeInput","beforeinput",null,n,S),k.push({event:S,listeners:g}),S.data=V))}Zo(k,t)})}function pr(e,t,n){return{instance:e,listener:t,currentTarget:n}}function Zr(e,t){for(var n=t+"Capture",r=[];e!==null;){var i=e,l=i.stateNode;i.tag===5&&l!==null&&(i=l,l=Kn(e,n),l!=null&&r.unshift(pr(e,l,i)),l=Kn(e,t),l!=null&&r.push(pr(e,l,i))),e=e.return}return r}function Rn(e){if(e===null)return null;do e=e.return;while(e&&e.tag!==5);return e||null}function es(e,t,n,r,i){for(var l=t._reactName,a=[];n!==null&&n!==r;){var s=n,c=s.alternate,g=s.stateNode;if(c!==null&&c===r)break;s.tag===5&&g!==null&&(s=g,i?(c=Kn(n,l),c!=null&&a.unshift(pr(n,c,s))):i||(c=Kn(n,l),c!=null&&a.push(pr(n,c,s)))),n=n.return}a.length!==0&&e.push({event:t,listeners:a})}var pp=/\r\n?/g,dp=/\u0000|\uFFFD/g;function ts(e){return(typeof e=="string"?e:""+e).replace(pp,`
`).replace(dp,"")}function Jr(e,t,n){if(t=ts(t),ts(e)!==t&&n)throw Error(o(425))}function ei(){}var Cl=null,Rl=null;function Tl(e,t){return e==="textarea"||e==="noscript"||typeof t.children=="string"||typeof t.children=="number"||typeof t.dangerouslySetInnerHTML=="object"&&t.dangerouslySetInnerHTML!==null&&t.dangerouslySetInnerHTML.__html!=null}var bl=typeof setTimeout=="function"?setTimeout:void 0,fp=typeof clearTimeout=="function"?clearTimeout:void 0,ns=typeof Promise=="function"?Promise:void 0,hp=typeof queueMicrotask=="function"?queueMicrotask:typeof ns<"u"?function(e){return ns.resolve(null).then(e).catch(gp)}:bl;function gp(e){setTimeout(function(){throw e})}function Nl(e,t){var n=t,r=0;do{var i=n.nextSibling;if(e.removeChild(n),i&&i.nodeType===8)if(n=i.data,n==="/$"){if(r===0){e.removeChild(i),tr(t);return}r--}else n!=="$"&&n!=="$?"&&n!=="$!"||r++;n=i}while(n);tr(t)}function Ft(e){for(;e!=null;e=e.nextSibling){var t=e.nodeType;if(t===1||t===3)break;if(t===8){if(t=e.data,t==="$"||t==="$!"||t==="$?")break;if(t==="/$")return null}}return e}function rs(e){e=e.previousSibling;for(var t=0;e;){if(e.nodeType===8){var n=e.data;if(n==="$"||n==="$!"||n==="$?"){if(t===0)return e;t--}else n==="/$"&&t++}e=e.previousSibling}return null}var Tn=Math.random().toString(36).slice(2),St="__reactFiber$"+Tn,dr="__reactProps$"+Tn,bt="__reactContainer$"+Tn,Al="__reactEvents$"+Tn,mp="__reactListeners$"+Tn,yp="__reactHandles$"+Tn;function rn(e){var t=e[St];if(t)return t;for(var n=e.parentNode;n;){if(t=n[bt]||n[St]){if(n=t.alternate,t.child!==null||n!==null&&n.child!==null)for(e=rs(e);e!==null;){if(n=e[St])return n;e=rs(e)}return t}e=n,n=e.parentNode}return null}function fr(e){return e=e[St]||e[bt],!e||e.tag!==5&&e.tag!==6&&e.tag!==13&&e.tag!==3?null:e}function bn(e){if(e.tag===5||e.tag===6)return e.stateNode;throw Error(o(33))}function ti(e){return e[dr]||null}var Ol=[],Nn=-1;function Ht(e){return{current:e}}function ve(e){0>Nn||(e.current=Ol[Nn],Ol[Nn]=null,Nn--)}function ge(e,t){Nn++,Ol[Nn]=e.current,e.current=t}var $t={},ze=Ht($t),Ye=Ht(!1),ln=$t;function An(e,t){var n=e.type.contextTypes;if(!n)return $t;var r=e.stateNode;if(r&&r.__reactInternalMemoizedUnmaskedChildContext===t)return r.__reactInternalMemoizedMaskedChildContext;var i={},l;for(l in n)i[l]=t[l];return r&&(e=e.stateNode,e.__reactInternalMemoizedUnmaskedChildContext=t,e.__reactInternalMemoizedMaskedChildContext=i),i}function qe(e){return e=e.childContextTypes,e!=null}function ni(){ve(Ye),ve(ze)}function is(e,t,n){if(ze.current!==$t)throw Error(o(168));ge(ze,t),ge(Ye,n)}function ls(e,t,n){var r=e.stateNode;if(t=t.childContextTypes,typeof r.getChildContext!="function")return n;r=r.getChildContext();for(var i in r)if(!(i in t))throw Error(o(108,le(e)||"Unknown",i));return B({},n,r)}function ri(e){return e=(e=e.stateNode)&&e.__reactInternalMemoizedMergedChildContext||$t,ln=ze.current,ge(ze,e),ge(Ye,Ye.current),!0}function as(e,t,n){var r=e.stateNode;if(!r)throw Error(o(169));n?(e=ls(e,t,ln),r.__reactInternalMemoizedMergedChildContext=e,ve(Ye),ve(ze),ge(ze,e)):ve(Ye),ge(Ye,n)}var Nt=null,ii=!1,Il=!1;function os(e){Nt===null?Nt=[e]:Nt.push(e)}function vp(e){ii=!0,os(e)}function Kt(){if(!Il&&Nt!==null){Il=!0;var e=0,t=de;try{var n=Nt;for(de=1;e<n.length;e++){var r=n[e];do r=r(!0);while(r!==null)}Nt=null,ii=!1}catch(i){throw Nt!==null&&(Nt=Nt.slice(e+1)),so(Ji,Kt),i}finally{de=t,Il=!1}}return null}var On=[],In=0,li=null,ai=0,ot=[],st=0,an=null,At=1,Ot="";function on(e,t){On[In++]=ai,On[In++]=li,li=e,ai=t}function ss(e,t,n){ot[st++]=At,ot[st++]=Ot,ot[st++]=an,an=e;var r=At;e=Ot;var i=32-ft(r)-1;r&=~(1<<i),n+=1;var l=32-ft(t)+i;if(30<l){var a=i-i%5;l=(r&(1<<a)-1).toString(32),r>>=a,i-=a,At=1<<32-ft(t)+i|n<<i|r,Ot=l+e}else At=1<<l|n<<i|r,Ot=e}function _l(e){e.return!==null&&(on(e,1),ss(e,1,0))}function Ll(e){for(;e===li;)li=On[--In],On[In]=null,ai=On[--In],On[In]=null;for(;e===an;)an=ot[--st],ot[st]=null,Ot=ot[--st],ot[st]=null,At=ot[--st],ot[st]=null}var rt=null,it=null,we=!1,gt=null;function us(e,t){var n=dt(5,null,null,0);n.elementType="DELETED",n.stateNode=t,n.return=e,t=e.deletions,t===null?(e.deletions=[n],e.flags|=16):t.push(n)}function cs(e,t){switch(e.tag){case 5:var n=e.type;return t=t.nodeType!==1||n.toLowerCase()!==t.nodeName.toLowerCase()?null:t,t!==null?(e.stateNode=t,rt=e,it=Ft(t.firstChild),!0):!1;case 6:return t=e.pendingProps===""||t.nodeType!==3?null:t,t!==null?(e.stateNode=t,rt=e,it=null,!0):!1;case 13:return t=t.nodeType!==8?null:t,t!==null?(n=an!==null?{id:At,overflow:Ot}:null,e.memoizedState={dehydrated:t,treeContext:n,retryLane:1073741824},n=dt(18,null,null,0),n.stateNode=t,n.return=e,e.child=n,rt=e,it=null,!0):!1;default:return!1}}function Bl(e){return(e.mode&1)!==0&&(e.flags&128)===0}function Dl(e){if(we){var t=it;if(t){var n=t;if(!cs(e,t)){if(Bl(e))throw Error(o(418));t=Ft(n.nextSibling);var r=rt;t&&cs(e,t)?us(r,n):(e.flags=e.flags&-4097|2,we=!1,rt=e)}}else{if(Bl(e))throw Error(o(418));e.flags=e.flags&-4097|2,we=!1,rt=e}}}function ps(e){for(e=e.return;e!==null&&e.tag!==5&&e.tag!==3&&e.tag!==13;)e=e.return;rt=e}function oi(e){if(e!==rt)return!1;if(!we)return ps(e),we=!0,!1;var t;if((t=e.tag!==3)&&!(t=e.tag!==5)&&(t=e.type,t=t!=="head"&&t!=="body"&&!Tl(e.type,e.memoizedProps)),t&&(t=it)){if(Bl(e))throw ds(),Error(o(418));for(;t;)us(e,t),t=Ft(t.nextSibling)}if(ps(e),e.tag===13){if(e=e.memoizedState,e=e!==null?e.dehydrated:null,!e)throw Error(o(317));e:{for(e=e.nextSibling,t=0;e;){if(e.nodeType===8){var n=e.data;if(n==="/$"){if(t===0){it=Ft(e.nextSibling);break e}t--}else n!=="$"&&n!=="$!"&&n!=="$?"||t++}e=e.nextSibling}it=null}}else it=rt?Ft(e.stateNode.nextSibling):null;return!0}function ds(){for(var e=it;e;)e=Ft(e.nextSibling)}function _n(){it=rt=null,we=!1}function Pl(e){gt===null?gt=[e]:gt.push(e)}var xp=oe.ReactCurrentBatchConfig;function hr(e,t,n){if(e=n.ref,e!==null&&typeof e!="function"&&typeof e!="object"){if(n._owner){if(n=n._owner,n){if(n.tag!==1)throw Error(o(309));var r=n.stateNode}if(!r)throw Error(o(147,e));var i=r,l=""+e;return t!==null&&t.ref!==null&&typeof t.ref=="function"&&t.ref._stringRef===l?t.ref:(t=function(a){var s=i.refs;a===null?delete s[l]:s[l]=a},t._stringRef=l,t)}if(typeof e!="string")throw Error(o(284));if(!n._owner)throw Error(o(290,e))}return e}function si(e,t){throw e=Object.prototype.toString.call(t),Error(o(31,e==="[object Object]"?"object with keys {"+Object.keys(t).join(", ")+"}":e))}function fs(e){var t=e._init;return t(e._payload)}function hs(e){function t(f,p){if(e){var h=f.deletions;h===null?(f.deletions=[p],f.flags|=16):h.push(p)}}function n(f,p){if(!e)return null;for(;p!==null;)t(f,p),p=p.sibling;return null}function r(f,p){for(f=new Map;p!==null;)p.key!==null?f.set(p.key,p):f.set(p.index,p),p=p.sibling;return f}function i(f,p){return f=en(f,p),f.index=0,f.sibling=null,f}function l(f,p,h){return f.index=h,e?(h=f.alternate,h!==null?(h=h.index,h<p?(f.flags|=2,p):h):(f.flags|=2,p)):(f.flags|=1048576,p)}function a(f){return e&&f.alternate===null&&(f.flags|=2),f}function s(f,p,h,R){return p===null||p.tag!==6?(p=ba(h,f.mode,R),p.return=f,p):(p=i(p,h),p.return=f,p)}function c(f,p,h,R){var G=h.type;return G===Ae?S(f,p,h.props.children,R,h.key):p!==null&&(p.elementType===G||typeof G=="object"&&G!==null&&G.$$typeof===je&&fs(G)===p.type)?(R=i(p,h.props),R.ref=hr(f,p,h),R.return=f,R):(R=_i(h.type,h.key,h.props,null,f.mode,R),R.ref=hr(f,p,h),R.return=f,R)}function g(f,p,h,R){return p===null||p.tag!==4||p.stateNode.containerInfo!==h.containerInfo||p.stateNode.implementation!==h.implementation?(p=Na(h,f.mode,R),p.return=f,p):(p=i(p,h.children||[]),p.return=f,p)}function S(f,p,h,R,G){return p===null||p.tag!==7?(p=gn(h,f.mode,R,G),p.return=f,p):(p=i(p,h),p.return=f,p)}function k(f,p,h){if(typeof p=="string"&&p!==""||typeof p=="number")return p=ba(""+p,f.mode,h),p.return=f,p;if(typeof p=="object"&&p!==null){switch(p.$$typeof){case He:return h=_i(p.type,p.key,p.props,null,f.mode,h),h.ref=hr(f,null,p),h.return=f,h;case Ce:return p=Na(p,f.mode,h),p.return=f,p;case je:var R=p._init;return k(f,R(p._payload),h)}if(Fn(p)||Y(p))return p=gn(p,f.mode,h,null),p.return=f,p;si(f,p)}return null}function E(f,p,h,R){var G=p!==null?p.key:null;if(typeof h=="string"&&h!==""||typeof h=="number")return G!==null?null:s(f,p,""+h,R);if(typeof h=="object"&&h!==null){switch(h.$$typeof){case He:return h.key===G?c(f,p,h,R):null;case Ce:return h.key===G?g(f,p,h,R):null;case je:return G=h._init,E(f,p,G(h._payload),R)}if(Fn(h)||Y(h))return G!==null?null:S(f,p,h,R,null);si(f,h)}return null}function _(f,p,h,R,G){if(typeof R=="string"&&R!==""||typeof R=="number")return f=f.get(h)||null,s(p,f,""+R,G);if(typeof R=="object"&&R!==null){switch(R.$$typeof){case He:return f=f.get(R.key===null?h:R.key)||null,c(p,f,R,G);case Ce:return f=f.get(R.key===null?h:R.key)||null,g(p,f,R,G);case je:var K=R._init;return _(f,p,h,K(R._payload),G)}if(Fn(R)||Y(R))return f=f.get(h)||null,S(p,f,R,G,null);si(p,R)}return null}function M(f,p,h,R){for(var G=null,K=null,V=p,X=p=0,Pe=null;V!==null&&X<h.length;X++){V.index>X?(Pe=V,V=null):Pe=V.sibling;var se=E(f,V,h[X],R);if(se===null){V===null&&(V=Pe);break}e&&V&&se.alternate===null&&t(f,V),p=l(se,p,X),K===null?G=se:K.sibling=se,K=se,V=Pe}if(X===h.length)return n(f,V),we&&on(f,X),G;if(V===null){for(;X<h.length;X++)V=k(f,h[X],R),V!==null&&(p=l(V,p,X),K===null?G=V:K.sibling=V,K=V);return we&&on(f,X),G}for(V=r(f,V);X<h.length;X++)Pe=_(V,f,X,h[X],R),Pe!==null&&(e&&Pe.alternate!==null&&V.delete(Pe.key===null?X:Pe.key),p=l(Pe,p,X),K===null?G=Pe:K.sibling=Pe,K=Pe);return e&&V.forEach(function(tn){return t(f,tn)}),we&&on(f,X),G}function j(f,p,h,R){var G=Y(h);if(typeof G!="function")throw Error(o(150));if(h=G.call(h),h==null)throw Error(o(151));for(var K=G=null,V=p,X=p=0,Pe=null,se=h.next();V!==null&&!se.done;X++,se=h.next()){V.index>X?(Pe=V,V=null):Pe=V.sibling;var tn=E(f,V,se.value,R);if(tn===null){V===null&&(V=Pe);break}e&&V&&tn.alternate===null&&t(f,V),p=l(tn,p,X),K===null?G=tn:K.sibling=tn,K=tn,V=Pe}if(se.done)return n(f,V),we&&on(f,X),G;if(V===null){for(;!se.done;X++,se=h.next())se=k(f,se.value,R),se!==null&&(p=l(se,p,X),K===null?G=se:K.sibling=se,K=se);return we&&on(f,X),G}for(V=r(f,V);!se.done;X++,se=h.next())se=_(V,f,X,se.value,R),se!==null&&(e&&se.alternate!==null&&V.delete(se.key===null?X:se.key),p=l(se,p,X),K===null?G=se:K.sibling=se,K=se);return e&&V.forEach(function(Zp){return t(f,Zp)}),we&&on(f,X),G}function Te(f,p,h,R){if(typeof h=="object"&&h!==null&&h.type===Ae&&h.key===null&&(h=h.props.children),typeof h=="object"&&h!==null){switch(h.$$typeof){case He:e:{for(var G=h.key,K=p;K!==null;){if(K.key===G){if(G=h.type,G===Ae){if(K.tag===7){n(f,K.sibling),p=i(K,h.props.children),p.return=f,f=p;break e}}else if(K.elementType===G||typeof G=="object"&&G!==null&&G.$$typeof===je&&fs(G)===K.type){n(f,K.sibling),p=i(K,h.props),p.ref=hr(f,K,h),p.return=f,f=p;break e}n(f,K);break}else t(f,K);K=K.sibling}h.type===Ae?(p=gn(h.props.children,f.mode,R,h.key),p.return=f,f=p):(R=_i(h.type,h.key,h.props,null,f.mode,R),R.ref=hr(f,p,h),R.return=f,f=R)}return a(f);case Ce:e:{for(K=h.key;p!==null;){if(p.key===K)if(p.tag===4&&p.stateNode.containerInfo===h.containerInfo&&p.stateNode.implementation===h.implementation){n(f,p.sibling),p=i(p,h.children||[]),p.return=f,f=p;break e}else{n(f,p);break}else t(f,p);p=p.sibling}p=Na(h,f.mode,R),p.return=f,f=p}return a(f);case je:return K=h._init,Te(f,p,K(h._payload),R)}if(Fn(h))return M(f,p,h,R);if(Y(h))return j(f,p,h,R);si(f,h)}return typeof h=="string"&&h!==""||typeof h=="number"?(h=""+h,p!==null&&p.tag===6?(n(f,p.sibling),p=i(p,h),p.return=f,f=p):(n(f,p),p=ba(h,f.mode,R),p.return=f,f=p),a(f)):n(f,p)}return Te}var Ln=hs(!0),gs=hs(!1),ui=Ht(null),ci=null,Bn=null,Ml=null;function Wl(){Ml=Bn=ci=null}function jl(e){var t=ui.current;ve(ui),e._currentValue=t}function zl(e,t,n){for(;e!==null;){var r=e.alternate;if((e.childLanes&t)!==t?(e.childLanes|=t,r!==null&&(r.childLanes|=t)):r!==null&&(r.childLanes&t)!==t&&(r.childLanes|=t),e===n)break;e=e.return}}function Dn(e,t){ci=e,Ml=Bn=null,e=e.dependencies,e!==null&&e.firstContext!==null&&((e.lanes&t)!==0&&(Qe=!0),e.firstContext=null)}function ut(e){var t=e._currentValue;if(Ml!==e)if(e={context:e,memoizedValue:t,next:null},Bn===null){if(ci===null)throw Error(o(308));Bn=e,ci.dependencies={lanes:0,firstContext:e}}else Bn=Bn.next=e;return t}var sn=null;function Ul(e){sn===null?sn=[e]:sn.push(e)}function ms(e,t,n,r){var i=t.interleaved;return i===null?(n.next=n,Ul(t)):(n.next=i.next,i.next=n),t.interleaved=n,It(e,r)}function It(e,t){e.lanes|=t;var n=e.alternate;for(n!==null&&(n.lanes|=t),n=e,e=e.return;e!==null;)e.childLanes|=t,n=e.alternate,n!==null&&(n.childLanes|=t),n=e,e=e.return;return n.tag===3?n.stateNode:null}var Vt=!1;function Gl(e){e.updateQueue={baseState:e.memoizedState,firstBaseUpdate:null,lastBaseUpdate:null,shared:{pending:null,interleaved:null,lanes:0},effects:null}}function ys(e,t){e=e.updateQueue,t.updateQueue===e&&(t.updateQueue={baseState:e.baseState,firstBaseUpdate:e.firstBaseUpdate,lastBaseUpdate:e.lastBaseUpdate,shared:e.shared,effects:e.effects})}function _t(e,t){return{eventTime:e,lane:t,tag:0,payload:null,callback:null,next:null}}function Yt(e,t,n){var r=e.updateQueue;if(r===null)return null;if(r=r.shared,(ae&2)!==0){var i=r.pending;return i===null?t.next=t:(t.next=i.next,i.next=t),r.pending=t,It(e,n)}return i=r.interleaved,i===null?(t.next=t,Ul(r)):(t.next=i.next,i.next=t),r.interleaved=t,It(e,n)}function pi(e,t,n){if(t=t.updateQueue,t!==null&&(t=t.shared,(n&4194240)!==0)){var r=t.lanes;r&=e.pendingLanes,n|=r,t.lanes=n,nl(e,n)}}function vs(e,t){var n=e.updateQueue,r=e.alternate;if(r!==null&&(r=r.updateQueue,n===r)){var i=null,l=null;if(n=n.firstBaseUpdate,n!==null){do{var a={eventTime:n.eventTime,lane:n.lane,tag:n.tag,payload:n.payload,callback:n.callback,next:null};l===null?i=l=a:l=l.next=a,n=n.next}while(n!==null);l===null?i=l=t:l=l.next=t}else i=l=t;n={baseState:r.baseState,firstBaseUpdate:i,lastBaseUpdate:l,shared:r.shared,effects:r.effects},e.updateQueue=n;return}e=n.lastBaseUpdate,e===null?n.firstBaseUpdate=t:e.next=t,n.lastBaseUpdate=t}function di(e,t,n,r){var i=e.updateQueue;Vt=!1;var l=i.firstBaseUpdate,a=i.lastBaseUpdate,s=i.shared.pending;if(s!==null){i.shared.pending=null;var c=s,g=c.next;c.next=null,a===null?l=g:a.next=g,a=c;var S=e.alternate;S!==null&&(S=S.updateQueue,s=S.lastBaseUpdate,s!==a&&(s===null?S.firstBaseUpdate=g:s.next=g,S.lastBaseUpdate=c))}if(l!==null){var k=i.baseState;a=0,S=g=c=null,s=l;do{var E=s.lane,_=s.eventTime;if((r&E)===E){S!==null&&(S=S.next={eventTime:_,lane:0,tag:s.tag,payload:s.payload,callback:s.callback,next:null});e:{var M=e,j=s;switch(E=t,_=n,j.tag){case 1:if(M=j.payload,typeof M=="function"){k=M.call(_,k,E);break e}k=M;break e;case 3:M.flags=M.flags&-65537|128;case 0:if(M=j.payload,E=typeof M=="function"?M.call(_,k,E):M,E==null)break e;k=B({},k,E);break e;case 2:Vt=!0}}s.callback!==null&&s.lane!==0&&(e.flags|=64,E=i.effects,E===null?i.effects=[s]:E.push(s))}else _={eventTime:_,lane:E,tag:s.tag,payload:s.payload,callback:s.callback,next:null},S===null?(g=S=_,c=k):S=S.next=_,a|=E;if(s=s.next,s===null){if(s=i.shared.pending,s===null)break;E=s,s=E.next,E.next=null,i.lastBaseUpdate=E,i.shared.pending=null}}while(!0);if(S===null&&(c=k),i.baseState=c,i.firstBaseUpdate=g,i.lastBaseUpdate=S,t=i.shared.interleaved,t!==null){i=t;do a|=i.lane,i=i.next;while(i!==t)}else l===null&&(i.shared.lanes=0);pn|=a,e.lanes=a,e.memoizedState=k}}function xs(e,t,n){if(e=t.effects,t.effects=null,e!==null)for(t=0;t<e.length;t++){var r=e[t],i=r.callback;if(i!==null){if(r.callback=null,r=n,typeof i!="function")throw Error(o(191,i));i.call(r)}}}var gr={},kt=Ht(gr),mr=Ht(gr),yr=Ht(gr);function un(e){if(e===gr)throw Error(o(174));return e}function Fl(e,t){switch(ge(yr,t),ge(mr,e),ge(kt,gr),e=t.nodeType,e){case 9:case 11:t=(t=t.documentElement)?t.namespaceURI:Hi(null,"");break;default:e=e===8?t.parentNode:t,t=e.namespaceURI||null,e=e.tagName,t=Hi(t,e)}ve(kt),ge(kt,t)}function Pn(){ve(kt),ve(mr),ve(yr)}function ws(e){un(yr.current);var t=un(kt.current),n=Hi(t,e.type);t!==n&&(ge(mr,e),ge(kt,n))}function Hl(e){mr.current===e&&(ve(kt),ve(mr))}var Ee=Ht(0);function fi(e){for(var t=e;t!==null;){if(t.tag===13){var n=t.memoizedState;if(n!==null&&(n=n.dehydrated,n===null||n.data==="$?"||n.data==="$!"))return t}else if(t.tag===19&&t.memoizedProps.revealOrder!==void 0){if((t.flags&128)!==0)return t}else if(t.child!==null){t.child.return=t,t=t.child;continue}if(t===e)break;for(;t.sibling===null;){if(t.return===null||t.return===e)return null;t=t.return}t.sibling.return=t.return,t=t.sibling}return null}var $l=[];function Kl(){for(var e=0;e<$l.length;e++)$l[e]._workInProgressVersionPrimary=null;$l.length=0}var hi=oe.ReactCurrentDispatcher,Vl=oe.ReactCurrentBatchConfig,cn=0,Se=null,Ie=null,Be=null,gi=!1,vr=!1,xr=0,wp=0;function Ue(){throw Error(o(321))}function Yl(e,t){if(t===null)return!1;for(var n=0;n<t.length&&n<e.length;n++)if(!ht(e[n],t[n]))return!1;return!0}function ql(e,t,n,r,i,l){if(cn=l,Se=t,t.memoizedState=null,t.updateQueue=null,t.lanes=0,hi.current=e===null||e.memoizedState===null?Cp:Rp,e=n(r,i),vr){l=0;do{if(vr=!1,xr=0,25<=l)throw Error(o(301));l+=1,Be=Ie=null,t.updateQueue=null,hi.current=Tp,e=n(r,i)}while(vr)}if(hi.current=vi,t=Ie!==null&&Ie.next!==null,cn=0,Be=Ie=Se=null,gi=!1,t)throw Error(o(300));return e}function Ql(){var e=xr!==0;return xr=0,e}function Ct(){var e={memoizedState:null,baseState:null,baseQueue:null,queue:null,next:null};return Be===null?Se.memoizedState=Be=e:Be=Be.next=e,Be}function ct(){if(Ie===null){var e=Se.alternate;e=e!==null?e.memoizedState:null}else e=Ie.next;var t=Be===null?Se.memoizedState:Be.next;if(t!==null)Be=t,Ie=e;else{if(e===null)throw Error(o(310));Ie=e,e={memoizedState:Ie.memoizedState,baseState:Ie.baseState,baseQueue:Ie.baseQueue,queue:Ie.queue,next:null},Be===null?Se.memoizedState=Be=e:Be=Be.next=e}return Be}function wr(e,t){return typeof t=="function"?t(e):t}function Xl(e){var t=ct(),n=t.queue;if(n===null)throw Error(o(311));n.lastRenderedReducer=e;var r=Ie,i=r.baseQueue,l=n.pending;if(l!==null){if(i!==null){var a=i.next;i.next=l.next,l.next=a}r.baseQueue=i=l,n.pending=null}if(i!==null){l=i.next,r=r.baseState;var s=a=null,c=null,g=l;do{var S=g.lane;if((cn&S)===S)c!==null&&(c=c.next={lane:0,action:g.action,hasEagerState:g.hasEagerState,eagerState:g.eagerState,next:null}),r=g.hasEagerState?g.eagerState:e(r,g.action);else{var k={lane:S,action:g.action,hasEagerState:g.hasEagerState,eagerState:g.eagerState,next:null};c===null?(s=c=k,a=r):c=c.next=k,Se.lanes|=S,pn|=S}g=g.next}while(g!==null&&g!==l);c===null?a=r:c.next=s,ht(r,t.memoizedState)||(Qe=!0),t.memoizedState=r,t.baseState=a,t.baseQueue=c,n.lastRenderedState=r}if(e=n.interleaved,e!==null){i=e;do l=i.lane,Se.lanes|=l,pn|=l,i=i.next;while(i!==e)}else i===null&&(n.lanes=0);return[t.memoizedState,n.dispatch]}function Zl(e){var t=ct(),n=t.queue;if(n===null)throw Error(o(311));n.lastRenderedReducer=e;var r=n.dispatch,i=n.pending,l=t.memoizedState;if(i!==null){n.pending=null;var a=i=i.next;do l=e(l,a.action),a=a.next;while(a!==i);ht(l,t.memoizedState)||(Qe=!0),t.memoizedState=l,t.baseQueue===null&&(t.baseState=l),n.lastRenderedState=l}return[l,r]}function Es(){}function Ss(e,t){var n=Se,r=ct(),i=t(),l=!ht(r.memoizedState,i);if(l&&(r.memoizedState=i,Qe=!0),r=r.queue,Jl(Rs.bind(null,n,r,e),[e]),r.getSnapshot!==t||l||Be!==null&&Be.memoizedState.tag&1){if(n.flags|=2048,Er(9,Cs.bind(null,n,r,i,t),void 0,null),De===null)throw Error(o(349));(cn&30)!==0||ks(n,t,i)}return i}function ks(e,t,n){e.flags|=16384,e={getSnapshot:t,value:n},t=Se.updateQueue,t===null?(t={lastEffect:null,stores:null},Se.updateQueue=t,t.stores=[e]):(n=t.stores,n===null?t.stores=[e]:n.push(e))}function Cs(e,t,n,r){t.value=n,t.getSnapshot=r,Ts(t)&&bs(e)}function Rs(e,t,n){return n(function(){Ts(t)&&bs(e)})}function Ts(e){var t=e.getSnapshot;e=e.value;try{var n=t();return!ht(e,n)}catch{return!0}}function bs(e){var t=It(e,1);t!==null&&xt(t,e,1,-1)}function Ns(e){var t=Ct();return typeof e=="function"&&(e=e()),t.memoizedState=t.baseState=e,e={pending:null,interleaved:null,lanes:0,dispatch:null,lastRenderedReducer:wr,lastRenderedState:e},t.queue=e,e=e.dispatch=kp.bind(null,Se,e),[t.memoizedState,e]}function Er(e,t,n,r){return e={tag:e,create:t,destroy:n,deps:r,next:null},t=Se.updateQueue,t===null?(t={lastEffect:null,stores:null},Se.updateQueue=t,t.lastEffect=e.next=e):(n=t.lastEffect,n===null?t.lastEffect=e.next=e:(r=n.next,n.next=e,e.next=r,t.lastEffect=e)),e}function As(){return ct().memoizedState}function mi(e,t,n,r){var i=Ct();Se.flags|=e,i.memoizedState=Er(1|t,n,void 0,r===void 0?null:r)}function yi(e,t,n,r){var i=ct();r=r===void 0?null:r;var l=void 0;if(Ie!==null){var a=Ie.memoizedState;if(l=a.destroy,r!==null&&Yl(r,a.deps)){i.memoizedState=Er(t,n,l,r);return}}Se.flags|=e,i.memoizedState=Er(1|t,n,l,r)}function Os(e,t){return mi(8390656,8,e,t)}function Jl(e,t){return yi(2048,8,e,t)}function Is(e,t){return yi(4,2,e,t)}function _s(e,t){return yi(4,4,e,t)}function Ls(e,t){if(typeof t=="function")return e=e(),t(e),function(){t(null)};if(t!=null)return e=e(),t.current=e,function(){t.current=null}}function Bs(e,t,n){return n=n!=null?n.concat([e]):null,yi(4,4,Ls.bind(null,t,e),n)}function ea(){}function Ds(e,t){var n=ct();t=t===void 0?null:t;var r=n.memoizedState;return r!==null&&t!==null&&Yl(t,r[1])?r[0]:(n.memoizedState=[e,t],e)}function Ps(e,t){var n=ct();t=t===void 0?null:t;var r=n.memoizedState;return r!==null&&t!==null&&Yl(t,r[1])?r[0]:(e=e(),n.memoizedState=[e,t],e)}function Ms(e,t,n){return(cn&21)===0?(e.baseState&&(e.baseState=!1,Qe=!0),e.memoizedState=n):(ht(n,t)||(n=fo(),Se.lanes|=n,pn|=n,e.baseState=!0),t)}function Ep(e,t){var n=de;de=n!==0&&4>n?n:4,e(!0);var r=Vl.transition;Vl.transition={};try{e(!1),t()}finally{de=n,Vl.transition=r}}function Ws(){return ct().memoizedState}function Sp(e,t,n){var r=Zt(e);if(n={lane:r,action:n,hasEagerState:!1,eagerState:null,next:null},js(e))zs(t,n);else if(n=ms(e,t,n,r),n!==null){var i=Ke();xt(n,e,r,i),Us(n,t,r)}}function kp(e,t,n){var r=Zt(e),i={lane:r,action:n,hasEagerState:!1,eagerState:null,next:null};if(js(e))zs(t,i);else{var l=e.alternate;if(e.lanes===0&&(l===null||l.lanes===0)&&(l=t.lastRenderedReducer,l!==null))try{var a=t.lastRenderedState,s=l(a,n);if(i.hasEagerState=!0,i.eagerState=s,ht(s,a)){var c=t.interleaved;c===null?(i.next=i,Ul(t)):(i.next=c.next,c.next=i),t.interleaved=i;return}}catch{}finally{}n=ms(e,t,i,r),n!==null&&(i=Ke(),xt(n,e,r,i),Us(n,t,r))}}function js(e){var t=e.alternate;return e===Se||t!==null&&t===Se}function zs(e,t){vr=gi=!0;var n=e.pending;n===null?t.next=t:(t.next=n.next,n.next=t),e.pending=t}function Us(e,t,n){if((n&4194240)!==0){var r=t.lanes;r&=e.pendingLanes,n|=r,t.lanes=n,nl(e,n)}}var vi={readContext:ut,useCallback:Ue,useContext:Ue,useEffect:Ue,useImperativeHandle:Ue,useInsertionEffect:Ue,useLayoutEffect:Ue,useMemo:Ue,useReducer:Ue,useRef:Ue,useState:Ue,useDebugValue:Ue,useDeferredValue:Ue,useTransition:Ue,useMutableSource:Ue,useSyncExternalStore:Ue,useId:Ue,unstable_isNewReconciler:!1},Cp={readContext:ut,useCallback:function(e,t){return Ct().memoizedState=[e,t===void 0?null:t],e},useContext:ut,useEffect:Os,useImperativeHandle:function(e,t,n){return n=n!=null?n.concat([e]):null,mi(4194308,4,Ls.bind(null,t,e),n)},useLayoutEffect:function(e,t){return mi(4194308,4,e,t)},useInsertionEffect:function(e,t){return mi(4,2,e,t)},useMemo:function(e,t){var n=Ct();return t=t===void 0?null:t,e=e(),n.memoizedState=[e,t],e},useReducer:function(e,t,n){var r=Ct();return t=n!==void 0?n(t):t,r.memoizedState=r.baseState=t,e={pending:null,interleaved:null,lanes:0,dispatch:null,lastRenderedReducer:e,lastRenderedState:t},r.queue=e,e=e.dispatch=Sp.bind(null,Se,e),[r.memoizedState,e]},useRef:function(e){var t=Ct();return e={current:e},t.memoizedState=e},useState:Ns,useDebugValue:ea,useDeferredValue:function(e){return Ct().memoizedState=e},useTransition:function(){var e=Ns(!1),t=e[0];return e=Ep.bind(null,e[1]),Ct().memoizedState=e,[t,e]},useMutableSource:function(){},useSyncExternalStore:function(e,t,n){var r=Se,i=Ct();if(we){if(n===void 0)throw Error(o(407));n=n()}else{if(n=t(),De===null)throw Error(o(349));(cn&30)!==0||ks(r,t,n)}i.memoizedState=n;var l={value:n,getSnapshot:t};return i.queue=l,Os(Rs.bind(null,r,l,e),[e]),r.flags|=2048,Er(9,Cs.bind(null,r,l,n,t),void 0,null),n},useId:function(){var e=Ct(),t=De.identifierPrefix;if(we){var n=Ot,r=At;n=(r&~(1<<32-ft(r)-1)).toString(32)+n,t=":"+t+"R"+n,n=xr++,0<n&&(t+="H"+n.toString(32)),t+=":"}else n=wp++,t=":"+t+"r"+n.toString(32)+":";return e.memoizedState=t},unstable_isNewReconciler:!1},Rp={readContext:ut,useCallback:Ds,useContext:ut,useEffect:Jl,useImperativeHandle:Bs,useInsertionEffect:Is,useLayoutEffect:_s,useMemo:Ps,useReducer:Xl,useRef:As,useState:function(){return Xl(wr)},useDebugValue:ea,useDeferredValue:function(e){var t=ct();return Ms(t,Ie.memoizedState,e)},useTransition:function(){var e=Xl(wr)[0],t=ct().memoizedState;return[e,t]},useMutableSource:Es,useSyncExternalStore:Ss,useId:Ws,unstable_isNewReconciler:!1},Tp={readContext:ut,useCallback:Ds,useContext:ut,useEffect:Jl,useImperativeHandle:Bs,useInsertionEffect:Is,useLayoutEffect:_s,useMemo:Ps,useReducer:Zl,useRef:As,useState:function(){return Zl(wr)},useDebugValue:ea,useDeferredValue:function(e){var t=ct();return Ie===null?t.memoizedState=e:Ms(t,Ie.memoizedState,e)},useTransition:function(){var e=Zl(wr)[0],t=ct().memoizedState;return[e,t]},useMutableSource:Es,useSyncExternalStore:Ss,useId:Ws,unstable_isNewReconciler:!1};function mt(e,t){if(e&&e.defaultProps){t=B({},t),e=e.defaultProps;for(var n in e)t[n]===void 0&&(t[n]=e[n]);return t}return t}function ta(e,t,n,r){t=e.memoizedState,n=n(r,t),n=n==null?t:B({},t,n),e.memoizedState=n,e.lanes===0&&(e.updateQueue.baseState=n)}var xi={isMounted:function(e){return(e=e._reactInternals)?nn(e)===e:!1},enqueueSetState:function(e,t,n){e=e._reactInternals;var r=Ke(),i=Zt(e),l=_t(r,i);l.payload=t,n!=null&&(l.callback=n),t=Yt(e,l,i),t!==null&&(xt(t,e,i,r),pi(t,e,i))},enqueueReplaceState:function(e,t,n){e=e._reactInternals;var r=Ke(),i=Zt(e),l=_t(r,i);l.tag=1,l.payload=t,n!=null&&(l.callback=n),t=Yt(e,l,i),t!==null&&(xt(t,e,i,r),pi(t,e,i))},enqueueForceUpdate:function(e,t){e=e._reactInternals;var n=Ke(),r=Zt(e),i=_t(n,r);i.tag=2,t!=null&&(i.callback=t),t=Yt(e,i,r),t!==null&&(xt(t,e,r,n),pi(t,e,r))}};function Gs(e,t,n,r,i,l,a){return e=e.stateNode,typeof e.shouldComponentUpdate=="function"?e.shouldComponentUpdate(r,l,a):t.prototype&&t.prototype.isPureReactComponent?!or(n,r)||!or(i,l):!0}function Fs(e,t,n){var r=!1,i=$t,l=t.contextType;return typeof l=="object"&&l!==null?l=ut(l):(i=qe(t)?ln:ze.current,r=t.contextTypes,l=(r=r!=null)?An(e,i):$t),t=new t(n,l),e.memoizedState=t.state!==null&&t.state!==void 0?t.state:null,t.updater=xi,e.stateNode=t,t._reactInternals=e,r&&(e=e.stateNode,e.__reactInternalMemoizedUnmaskedChildContext=i,e.__reactInternalMemoizedMaskedChildContext=l),t}function Hs(e,t,n,r){e=t.state,typeof t.componentWillReceiveProps=="function"&&t.componentWillReceiveProps(n,r),typeof t.UNSAFE_componentWillReceiveProps=="function"&&t.UNSAFE_componentWillReceiveProps(n,r),t.state!==e&&xi.enqueueReplaceState(t,t.state,null)}function na(e,t,n,r){var i=e.stateNode;i.props=n,i.state=e.memoizedState,i.refs={},Gl(e);var l=t.contextType;typeof l=="object"&&l!==null?i.context=ut(l):(l=qe(t)?ln:ze.current,i.context=An(e,l)),i.state=e.memoizedState,l=t.getDerivedStateFromProps,typeof l=="function"&&(ta(e,t,l,n),i.state=e.memoizedState),typeof t.getDerivedStateFromProps=="function"||typeof i.getSnapshotBeforeUpdate=="function"||typeof i.UNSAFE_componentWillMount!="function"&&typeof i.componentWillMount!="function"||(t=i.state,typeof i.componentWillMount=="function"&&i.componentWillMount(),typeof i.UNSAFE_componentWillMount=="function"&&i.UNSAFE_componentWillMount(),t!==i.state&&xi.enqueueReplaceState(i,i.state,null),di(e,n,i,r),i.state=e.memoizedState),typeof i.componentDidMount=="function"&&(e.flags|=4194308)}function Mn(e,t){try{var n="",r=t;do n+=F(r),r=r.return;while(r);var i=n}catch(l){i=`
Error generating stack: `+l.message+`
`+l.stack}return{value:e,source:t,stack:i,digest:null}}function ra(e,t,n){return{value:e,source:null,stack:n??null,digest:t??null}}function ia(e,t){try{console.error(t.value)}catch(n){setTimeout(function(){throw n})}}var bp=typeof WeakMap=="function"?WeakMap:Map;function $s(e,t,n){n=_t(-1,n),n.tag=3,n.payload={element:null};var r=t.value;return n.callback=function(){Ti||(Ti=!0,xa=r),ia(e,t)},n}function Ks(e,t,n){n=_t(-1,n),n.tag=3;var r=e.type.getDerivedStateFromError;if(typeof r=="function"){var i=t.value;n.payload=function(){return r(i)},n.callback=function(){ia(e,t)}}var l=e.stateNode;return l!==null&&typeof l.componentDidCatch=="function"&&(n.callback=function(){ia(e,t),typeof r!="function"&&(Qt===null?Qt=new Set([this]):Qt.add(this));var a=t.stack;this.componentDidCatch(t.value,{componentStack:a!==null?a:""})}),n}function Vs(e,t,n){var r=e.pingCache;if(r===null){r=e.pingCache=new bp;var i=new Set;r.set(t,i)}else i=r.get(t),i===void 0&&(i=new Set,r.set(t,i));i.has(n)||(i.add(n),e=Up.bind(null,e,t,n),t.then(e,e))}function Ys(e){do{var t;if((t=e.tag===13)&&(t=e.memoizedState,t=t!==null?t.dehydrated!==null:!0),t)return e;e=e.return}while(e!==null);return null}function qs(e,t,n,r,i){return(e.mode&1)===0?(e===t?e.flags|=65536:(e.flags|=128,n.flags|=131072,n.flags&=-52805,n.tag===1&&(n.alternate===null?n.tag=17:(t=_t(-1,1),t.tag=2,Yt(n,t,1))),n.lanes|=1),e):(e.flags|=65536,e.lanes=i,e)}var Np=oe.ReactCurrentOwner,Qe=!1;function $e(e,t,n,r){t.child=e===null?gs(t,null,n,r):Ln(t,e.child,n,r)}function Qs(e,t,n,r,i){n=n.render;var l=t.ref;return Dn(t,i),r=ql(e,t,n,r,l,i),n=Ql(),e!==null&&!Qe?(t.updateQueue=e.updateQueue,t.flags&=-2053,e.lanes&=~i,Lt(e,t,i)):(we&&n&&_l(t),t.flags|=1,$e(e,t,r,i),t.child)}function Xs(e,t,n,r,i){if(e===null){var l=n.type;return typeof l=="function"&&!Ta(l)&&l.defaultProps===void 0&&n.compare===null&&n.defaultProps===void 0?(t.tag=15,t.type=l,Zs(e,t,l,r,i)):(e=_i(n.type,null,r,t,t.mode,i),e.ref=t.ref,e.return=t,t.child=e)}if(l=e.child,(e.lanes&i)===0){var a=l.memoizedProps;if(n=n.compare,n=n!==null?n:or,n(a,r)&&e.ref===t.ref)return Lt(e,t,i)}return t.flags|=1,e=en(l,r),e.ref=t.ref,e.return=t,t.child=e}function Zs(e,t,n,r,i){if(e!==null){var l=e.memoizedProps;if(or(l,r)&&e.ref===t.ref)if(Qe=!1,t.pendingProps=r=l,(e.lanes&i)!==0)(e.flags&131072)!==0&&(Qe=!0);else return t.lanes=e.lanes,Lt(e,t,i)}return la(e,t,n,r,i)}function Js(e,t,n){var r=t.pendingProps,i=r.children,l=e!==null?e.memoizedState:null;if(r.mode==="hidden")if((t.mode&1)===0)t.memoizedState={baseLanes:0,cachePool:null,transitions:null},ge(jn,lt),lt|=n;else{if((n&1073741824)===0)return e=l!==null?l.baseLanes|n:n,t.lanes=t.childLanes=1073741824,t.memoizedState={baseLanes:e,cachePool:null,transitions:null},t.updateQueue=null,ge(jn,lt),lt|=e,null;t.memoizedState={baseLanes:0,cachePool:null,transitions:null},r=l!==null?l.baseLanes:n,ge(jn,lt),lt|=r}else l!==null?(r=l.baseLanes|n,t.memoizedState=null):r=n,ge(jn,lt),lt|=r;return $e(e,t,i,n),t.child}function eu(e,t){var n=t.ref;(e===null&&n!==null||e!==null&&e.ref!==n)&&(t.flags|=512,t.flags|=2097152)}function la(e,t,n,r,i){var l=qe(n)?ln:ze.current;return l=An(t,l),Dn(t,i),n=ql(e,t,n,r,l,i),r=Ql(),e!==null&&!Qe?(t.updateQueue=e.updateQueue,t.flags&=-2053,e.lanes&=~i,Lt(e,t,i)):(we&&r&&_l(t),t.flags|=1,$e(e,t,n,i),t.child)}function tu(e,t,n,r,i){if(qe(n)){var l=!0;ri(t)}else l=!1;if(Dn(t,i),t.stateNode===null)Ei(e,t),Fs(t,n,r),na(t,n,r,i),r=!0;else if(e===null){var a=t.stateNode,s=t.memoizedProps;a.props=s;var c=a.context,g=n.contextType;typeof g=="object"&&g!==null?g=ut(g):(g=qe(n)?ln:ze.current,g=An(t,g));var S=n.getDerivedStateFromProps,k=typeof S=="function"||typeof a.getSnapshotBeforeUpdate=="function";k||typeof a.UNSAFE_componentWillReceiveProps!="function"&&typeof a.componentWillReceiveProps!="function"||(s!==r||c!==g)&&Hs(t,a,r,g),Vt=!1;var E=t.memoizedState;a.state=E,di(t,r,a,i),c=t.memoizedState,s!==r||E!==c||Ye.current||Vt?(typeof S=="function"&&(ta(t,n,S,r),c=t.memoizedState),(s=Vt||Gs(t,n,s,r,E,c,g))?(k||typeof a.UNSAFE_componentWillMount!="function"&&typeof a.componentWillMount!="function"||(typeof a.componentWillMount=="function"&&a.componentWillMount(),typeof a.UNSAFE_componentWillMount=="function"&&a.UNSAFE_componentWillMount()),typeof a.componentDidMount=="function"&&(t.flags|=4194308)):(typeof a.componentDidMount=="function"&&(t.flags|=4194308),t.memoizedProps=r,t.memoizedState=c),a.props=r,a.state=c,a.context=g,r=s):(typeof a.componentDidMount=="function"&&(t.flags|=4194308),r=!1)}else{a=t.stateNode,ys(e,t),s=t.memoizedProps,g=t.type===t.elementType?s:mt(t.type,s),a.props=g,k=t.pendingProps,E=a.context,c=n.contextType,typeof c=="object"&&c!==null?c=ut(c):(c=qe(n)?ln:ze.current,c=An(t,c));var _=n.getDerivedStateFromProps;(S=typeof _=="function"||typeof a.getSnapshotBeforeUpdate=="function")||typeof a.UNSAFE_componentWillReceiveProps!="function"&&typeof a.componentWillReceiveProps!="function"||(s!==k||E!==c)&&Hs(t,a,r,c),Vt=!1,E=t.memoizedState,a.state=E,di(t,r,a,i);var M=t.memoizedState;s!==k||E!==M||Ye.current||Vt?(typeof _=="function"&&(ta(t,n,_,r),M=t.memoizedState),(g=Vt||Gs(t,n,g,r,E,M,c)||!1)?(S||typeof a.UNSAFE_componentWillUpdate!="function"&&typeof a.componentWillUpdate!="function"||(typeof a.componentWillUpdate=="function"&&a.componentWillUpdate(r,M,c),typeof a.UNSAFE_componentWillUpdate=="function"&&a.UNSAFE_componentWillUpdate(r,M,c)),typeof a.componentDidUpdate=="function"&&(t.flags|=4),typeof a.getSnapshotBeforeUpdate=="function"&&(t.flags|=1024)):(typeof a.componentDidUpdate!="function"||s===e.memoizedProps&&E===e.memoizedState||(t.flags|=4),typeof a.getSnapshotBeforeUpdate!="function"||s===e.memoizedProps&&E===e.memoizedState||(t.flags|=1024),t.memoizedProps=r,t.memoizedState=M),a.props=r,a.state=M,a.context=c,r=g):(typeof a.componentDidUpdate!="function"||s===e.memoizedProps&&E===e.memoizedState||(t.flags|=4),typeof a.getSnapshotBeforeUpdate!="function"||s===e.memoizedProps&&E===e.memoizedState||(t.flags|=1024),r=!1)}return aa(e,t,n,r,l,i)}function aa(e,t,n,r,i,l){eu(e,t);var a=(t.flags&128)!==0;if(!r&&!a)return i&&as(t,n,!1),Lt(e,t,l);r=t.stateNode,Np.current=t;var s=a&&typeof n.getDerivedStateFromError!="function"?null:r.render();return t.flags|=1,e!==null&&a?(t.child=Ln(t,e.child,null,l),t.child=Ln(t,null,s,l)):$e(e,t,s,l),t.memoizedState=r.state,i&&as(t,n,!0),t.child}function nu(e){var t=e.stateNode;t.pendingContext?is(e,t.pendingContext,t.pendingContext!==t.context):t.context&&is(e,t.context,!1),Fl(e,t.containerInfo)}function ru(e,t,n,r,i){return _n(),Pl(i),t.flags|=256,$e(e,t,n,r),t.child}var oa={dehydrated:null,treeContext:null,retryLane:0};function sa(e){return{baseLanes:e,cachePool:null,transitions:null}}function iu(e,t,n){var r=t.pendingProps,i=Ee.current,l=!1,a=(t.flags&128)!==0,s;if((s=a)||(s=e!==null&&e.memoizedState===null?!1:(i&2)!==0),s?(l=!0,t.flags&=-129):(e===null||e.memoizedState!==null)&&(i|=1),ge(Ee,i&1),e===null)return Dl(t),e=t.memoizedState,e!==null&&(e=e.dehydrated,e!==null)?((t.mode&1)===0?t.lanes=1:e.data==="$!"?t.lanes=8:t.lanes=1073741824,null):(a=r.children,e=r.fallback,l?(r=t.mode,l=t.child,a={mode:"hidden",children:a},(r&1)===0&&l!==null?(l.childLanes=0,l.pendingProps=a):l=Li(a,r,0,null),e=gn(e,r,n,null),l.return=t,e.return=t,l.sibling=e,t.child=l,t.child.memoizedState=sa(n),t.memoizedState=oa,e):ua(t,a));if(i=e.memoizedState,i!==null&&(s=i.dehydrated,s!==null))return Ap(e,t,a,r,s,i,n);if(l){l=r.fallback,a=t.mode,i=e.child,s=i.sibling;var c={mode:"hidden",children:r.children};return(a&1)===0&&t.child!==i?(r=t.child,r.childLanes=0,r.pendingProps=c,t.deletions=null):(r=en(i,c),r.subtreeFlags=i.subtreeFlags&14680064),s!==null?l=en(s,l):(l=gn(l,a,n,null),l.flags|=2),l.return=t,r.return=t,r.sibling=l,t.child=r,r=l,l=t.child,a=e.child.memoizedState,a=a===null?sa(n):{baseLanes:a.baseLanes|n,cachePool:null,transitions:a.transitions},l.memoizedState=a,l.childLanes=e.childLanes&~n,t.memoizedState=oa,r}return l=e.child,e=l.sibling,r=en(l,{mode:"visible",children:r.children}),(t.mode&1)===0&&(r.lanes=n),r.return=t,r.sibling=null,e!==null&&(n=t.deletions,n===null?(t.deletions=[e],t.flags|=16):n.push(e)),t.child=r,t.memoizedState=null,r}function ua(e,t){return t=Li({mode:"visible",children:t},e.mode,0,null),t.return=e,e.child=t}function wi(e,t,n,r){return r!==null&&Pl(r),Ln(t,e.child,null,n),e=ua(t,t.pendingProps.children),e.flags|=2,t.memoizedState=null,e}function Ap(e,t,n,r,i,l,a){if(n)return t.flags&256?(t.flags&=-257,r=ra(Error(o(422))),wi(e,t,a,r)):t.memoizedState!==null?(t.child=e.child,t.flags|=128,null):(l=r.fallback,i=t.mode,r=Li({mode:"visible",children:r.children},i,0,null),l=gn(l,i,a,null),l.flags|=2,r.return=t,l.return=t,r.sibling=l,t.child=r,(t.mode&1)!==0&&Ln(t,e.child,null,a),t.child.memoizedState=sa(a),t.memoizedState=oa,l);if((t.mode&1)===0)return wi(e,t,a,null);if(i.data==="$!"){if(r=i.nextSibling&&i.nextSibling.dataset,r)var s=r.dgst;return r=s,l=Error(o(419)),r=ra(l,r,void 0),wi(e,t,a,r)}if(s=(a&e.childLanes)!==0,Qe||s){if(r=De,r!==null){switch(a&-a){case 4:i=2;break;case 16:i=8;break;case 64:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:case 4194304:case 8388608:case 16777216:case 33554432:case 67108864:i=32;break;case 536870912:i=268435456;break;default:i=0}i=(i&(r.suspendedLanes|a))!==0?0:i,i!==0&&i!==l.retryLane&&(l.retryLane=i,It(e,i),xt(r,e,i,-1))}return Ra(),r=ra(Error(o(421))),wi(e,t,a,r)}return i.data==="$?"?(t.flags|=128,t.child=e.child,t=Gp.bind(null,e),i._reactRetry=t,null):(e=l.treeContext,it=Ft(i.nextSibling),rt=t,we=!0,gt=null,e!==null&&(ot[st++]=At,ot[st++]=Ot,ot[st++]=an,At=e.id,Ot=e.overflow,an=t),t=ua(t,r.children),t.flags|=4096,t)}function lu(e,t,n){e.lanes|=t;var r=e.alternate;r!==null&&(r.lanes|=t),zl(e.return,t,n)}function ca(e,t,n,r,i){var l=e.memoizedState;l===null?e.memoizedState={isBackwards:t,rendering:null,renderingStartTime:0,last:r,tail:n,tailMode:i}:(l.isBackwards=t,l.rendering=null,l.renderingStartTime=0,l.last=r,l.tail=n,l.tailMode=i)}function au(e,t,n){var r=t.pendingProps,i=r.revealOrder,l=r.tail;if($e(e,t,r.children,n),r=Ee.current,(r&2)!==0)r=r&1|2,t.flags|=128;else{if(e!==null&&(e.flags&128)!==0)e:for(e=t.child;e!==null;){if(e.tag===13)e.memoizedState!==null&&lu(e,n,t);else if(e.tag===19)lu(e,n,t);else if(e.child!==null){e.child.return=e,e=e.child;continue}if(e===t)break e;for(;e.sibling===null;){if(e.return===null||e.return===t)break e;e=e.return}e.sibling.return=e.return,e=e.sibling}r&=1}if(ge(Ee,r),(t.mode&1)===0)t.memoizedState=null;else switch(i){case"forwards":for(n=t.child,i=null;n!==null;)e=n.alternate,e!==null&&fi(e)===null&&(i=n),n=n.sibling;n=i,n===null?(i=t.child,t.child=null):(i=n.sibling,n.sibling=null),ca(t,!1,i,n,l);break;case"backwards":for(n=null,i=t.child,t.child=null;i!==null;){if(e=i.alternate,e!==null&&fi(e)===null){t.child=i;break}e=i.sibling,i.sibling=n,n=i,i=e}ca(t,!0,n,null,l);break;case"together":ca(t,!1,null,null,void 0);break;default:t.memoizedState=null}return t.child}function Ei(e,t){(t.mode&1)===0&&e!==null&&(e.alternate=null,t.alternate=null,t.flags|=2)}function Lt(e,t,n){if(e!==null&&(t.dependencies=e.dependencies),pn|=t.lanes,(n&t.childLanes)===0)return null;if(e!==null&&t.child!==e.child)throw Error(o(153));if(t.child!==null){for(e=t.child,n=en(e,e.pendingProps),t.child=n,n.return=t;e.sibling!==null;)e=e.sibling,n=n.sibling=en(e,e.pendingProps),n.return=t;n.sibling=null}return t.child}function Op(e,t,n){switch(t.tag){case 3:nu(t),_n();break;case 5:ws(t);break;case 1:qe(t.type)&&ri(t);break;case 4:Fl(t,t.stateNode.containerInfo);break;case 10:var r=t.type._context,i=t.memoizedProps.value;ge(ui,r._currentValue),r._currentValue=i;break;case 13:if(r=t.memoizedState,r!==null)return r.dehydrated!==null?(ge(Ee,Ee.current&1),t.flags|=128,null):(n&t.child.childLanes)!==0?iu(e,t,n):(ge(Ee,Ee.current&1),e=Lt(e,t,n),e!==null?e.sibling:null);ge(Ee,Ee.current&1);break;case 19:if(r=(n&t.childLanes)!==0,(e.flags&128)!==0){if(r)return au(e,t,n);t.flags|=128}if(i=t.memoizedState,i!==null&&(i.rendering=null,i.tail=null,i.lastEffect=null),ge(Ee,Ee.current),r)break;return null;case 22:case 23:return t.lanes=0,Js(e,t,n)}return Lt(e,t,n)}var ou,pa,su,uu;ou=function(e,t){for(var n=t.child;n!==null;){if(n.tag===5||n.tag===6)e.appendChild(n.stateNode);else if(n.tag!==4&&n.child!==null){n.child.return=n,n=n.child;continue}if(n===t)break;for(;n.sibling===null;){if(n.return===null||n.return===t)return;n=n.return}n.sibling.return=n.return,n=n.sibling}},pa=function(){},su=function(e,t,n,r){var i=e.memoizedProps;if(i!==r){e=t.stateNode,un(kt.current);var l=null;switch(n){case"input":i=mn(e,i),r=mn(e,r),l=[];break;case"select":i=B({},i,{value:void 0}),r=B({},r,{value:void 0}),l=[];break;case"textarea":i=Fi(e,i),r=Fi(e,r),l=[];break;default:typeof i.onClick!="function"&&typeof r.onClick=="function"&&(e.onclick=ei)}$i(n,r);var a;n=null;for(g in i)if(!r.hasOwnProperty(g)&&i.hasOwnProperty(g)&&i[g]!=null)if(g==="style"){var s=i[g];for(a in s)s.hasOwnProperty(a)&&(n||(n={}),n[a]="")}else g!=="dangerouslySetInnerHTML"&&g!=="children"&&g!=="suppressContentEditableWarning"&&g!=="suppressHydrationWarning"&&g!=="autoFocus"&&(v.hasOwnProperty(g)?l||(l=[]):(l=l||[]).push(g,null));for(g in r){var c=r[g];if(s=i!=null?i[g]:void 0,r.hasOwnProperty(g)&&c!==s&&(c!=null||s!=null))if(g==="style")if(s){for(a in s)!s.hasOwnProperty(a)||c&&c.hasOwnProperty(a)||(n||(n={}),n[a]="");for(a in c)c.hasOwnProperty(a)&&s[a]!==c[a]&&(n||(n={}),n[a]=c[a])}else n||(l||(l=[]),l.push(g,n)),n=c;else g==="dangerouslySetInnerHTML"?(c=c?c.__html:void 0,s=s?s.__html:void 0,c!=null&&s!==c&&(l=l||[]).push(g,c)):g==="children"?typeof c!="string"&&typeof c!="number"||(l=l||[]).push(g,""+c):g!=="suppressContentEditableWarning"&&g!=="suppressHydrationWarning"&&(v.hasOwnProperty(g)?(c!=null&&g==="onScroll"&&ye("scroll",e),l||s===c||(l=[])):(l=l||[]).push(g,c))}n&&(l=l||[]).push("style",n);var g=l;(t.updateQueue=g)&&(t.flags|=4)}},uu=function(e,t,n,r){n!==r&&(t.flags|=4)};function Sr(e,t){if(!we)switch(e.tailMode){case"hidden":t=e.tail;for(var n=null;t!==null;)t.alternate!==null&&(n=t),t=t.sibling;n===null?e.tail=null:n.sibling=null;break;case"collapsed":n=e.tail;for(var r=null;n!==null;)n.alternate!==null&&(r=n),n=n.sibling;r===null?t||e.tail===null?e.tail=null:e.tail.sibling=null:r.sibling=null}}function Ge(e){var t=e.alternate!==null&&e.alternate.child===e.child,n=0,r=0;if(t)for(var i=e.child;i!==null;)n|=i.lanes|i.childLanes,r|=i.subtreeFlags&14680064,r|=i.flags&14680064,i.return=e,i=i.sibling;else for(i=e.child;i!==null;)n|=i.lanes|i.childLanes,r|=i.subtreeFlags,r|=i.flags,i.return=e,i=i.sibling;return e.subtreeFlags|=r,e.childLanes=n,t}function Ip(e,t,n){var r=t.pendingProps;switch(Ll(t),t.tag){case 2:case 16:case 15:case 0:case 11:case 7:case 8:case 12:case 9:case 14:return Ge(t),null;case 1:return qe(t.type)&&ni(),Ge(t),null;case 3:return r=t.stateNode,Pn(),ve(Ye),ve(ze),Kl(),r.pendingContext&&(r.context=r.pendingContext,r.pendingContext=null),(e===null||e.child===null)&&(oi(t)?t.flags|=4:e===null||e.memoizedState.isDehydrated&&(t.flags&256)===0||(t.flags|=1024,gt!==null&&(Sa(gt),gt=null))),pa(e,t),Ge(t),null;case 5:Hl(t);var i=un(yr.current);if(n=t.type,e!==null&&t.stateNode!=null)su(e,t,n,r,i),e.ref!==t.ref&&(t.flags|=512,t.flags|=2097152);else{if(!r){if(t.stateNode===null)throw Error(o(166));return Ge(t),null}if(e=un(kt.current),oi(t)){r=t.stateNode,n=t.type;var l=t.memoizedProps;switch(r[St]=t,r[dr]=l,e=(t.mode&1)!==0,n){case"dialog":ye("cancel",r),ye("close",r);break;case"iframe":case"object":case"embed":ye("load",r);break;case"video":case"audio":for(i=0;i<ur.length;i++)ye(ur[i],r);break;case"source":ye("error",r);break;case"img":case"image":case"link":ye("error",r),ye("load",r);break;case"details":ye("toggle",r);break;case"input":tt(r,l),ye("invalid",r);break;case"select":r._wrapperState={wasMultiple:!!l.multiple},ye("invalid",r);break;case"textarea":$a(r,l),ye("invalid",r)}$i(n,l),i=null;for(var a in l)if(l.hasOwnProperty(a)){var s=l[a];a==="children"?typeof s=="string"?r.textContent!==s&&(l.suppressHydrationWarning!==!0&&Jr(r.textContent,s,e),i=["children",s]):typeof s=="number"&&r.textContent!==""+s&&(l.suppressHydrationWarning!==!0&&Jr(r.textContent,s,e),i=["children",""+s]):v.hasOwnProperty(a)&&s!=null&&a==="onScroll"&&ye("scroll",r)}switch(n){case"input":Dt(r),Ir(r,l,!0);break;case"textarea":Dt(r),Va(r);break;case"select":case"option":break;default:typeof l.onClick=="function"&&(r.onclick=ei)}r=i,t.updateQueue=r,r!==null&&(t.flags|=4)}else{a=i.nodeType===9?i:i.ownerDocument,e==="http://www.w3.org/1999/xhtml"&&(e=Ya(n)),e==="http://www.w3.org/1999/xhtml"?n==="script"?(e=a.createElement("div"),e.innerHTML="<script><\/script>",e=e.removeChild(e.firstChild)):typeof r.is=="string"?e=a.createElement(n,{is:r.is}):(e=a.createElement(n),n==="select"&&(a=e,r.multiple?a.multiple=!0:r.size&&(a.size=r.size))):e=a.createElementNS(e,n),e[St]=t,e[dr]=r,ou(e,t,!1,!1),t.stateNode=e;e:{switch(a=Ki(n,r),n){case"dialog":ye("cancel",e),ye("close",e),i=r;break;case"iframe":case"object":case"embed":ye("load",e),i=r;break;case"video":case"audio":for(i=0;i<ur.length;i++)ye(ur[i],e);i=r;break;case"source":ye("error",e),i=r;break;case"img":case"image":case"link":ye("error",e),ye("load",e),i=r;break;case"details":ye("toggle",e),i=r;break;case"input":tt(e,r),i=mn(e,r),ye("invalid",e);break;case"option":i=r;break;case"select":e._wrapperState={wasMultiple:!!r.multiple},i=B({},r,{value:void 0}),ye("invalid",e);break;case"textarea":$a(e,r),i=Fi(e,r),ye("invalid",e);break;default:i=r}$i(n,i),s=i;for(l in s)if(s.hasOwnProperty(l)){var c=s[l];l==="style"?Xa(e,c):l==="dangerouslySetInnerHTML"?(c=c?c.__html:void 0,c!=null&&qa(e,c)):l==="children"?typeof c=="string"?(n!=="textarea"||c!=="")&&Hn(e,c):typeof c=="number"&&Hn(e,""+c):l!=="suppressContentEditableWarning"&&l!=="suppressHydrationWarning"&&l!=="autoFocus"&&(v.hasOwnProperty(l)?c!=null&&l==="onScroll"&&ye("scroll",e):c!=null&&me(e,l,c,a))}switch(n){case"input":Dt(e),Ir(e,r,!1);break;case"textarea":Dt(e),Va(e);break;case"option":r.value!=null&&e.setAttribute("value",""+ee(r.value));break;case"select":e.multiple=!!r.multiple,l=r.value,l!=null?yn(e,!!r.multiple,l,!1):r.defaultValue!=null&&yn(e,!!r.multiple,r.defaultValue,!0);break;default:typeof i.onClick=="function"&&(e.onclick=ei)}switch(n){case"button":case"input":case"select":case"textarea":r=!!r.autoFocus;break e;case"img":r=!0;break e;default:r=!1}}r&&(t.flags|=4)}t.ref!==null&&(t.flags|=512,t.flags|=2097152)}return Ge(t),null;case 6:if(e&&t.stateNode!=null)uu(e,t,e.memoizedProps,r);else{if(typeof r!="string"&&t.stateNode===null)throw Error(o(166));if(n=un(yr.current),un(kt.current),oi(t)){if(r=t.stateNode,n=t.memoizedProps,r[St]=t,(l=r.nodeValue!==n)&&(e=rt,e!==null))switch(e.tag){case 3:Jr(r.nodeValue,n,(e.mode&1)!==0);break;case 5:e.memoizedProps.suppressHydrationWarning!==!0&&Jr(r.nodeValue,n,(e.mode&1)!==0)}l&&(t.flags|=4)}else r=(n.nodeType===9?n:n.ownerDocument).createTextNode(r),r[St]=t,t.stateNode=r}return Ge(t),null;case 13:if(ve(Ee),r=t.memoizedState,e===null||e.memoizedState!==null&&e.memoizedState.dehydrated!==null){if(we&&it!==null&&(t.mode&1)!==0&&(t.flags&128)===0)ds(),_n(),t.flags|=98560,l=!1;else if(l=oi(t),r!==null&&r.dehydrated!==null){if(e===null){if(!l)throw Error(o(318));if(l=t.memoizedState,l=l!==null?l.dehydrated:null,!l)throw Error(o(317));l[St]=t}else _n(),(t.flags&128)===0&&(t.memoizedState=null),t.flags|=4;Ge(t),l=!1}else gt!==null&&(Sa(gt),gt=null),l=!0;if(!l)return t.flags&65536?t:null}return(t.flags&128)!==0?(t.lanes=n,t):(r=r!==null,r!==(e!==null&&e.memoizedState!==null)&&r&&(t.child.flags|=8192,(t.mode&1)!==0&&(e===null||(Ee.current&1)!==0?_e===0&&(_e=3):Ra())),t.updateQueue!==null&&(t.flags|=4),Ge(t),null);case 4:return Pn(),pa(e,t),e===null&&cr(t.stateNode.containerInfo),Ge(t),null;case 10:return jl(t.type._context),Ge(t),null;case 17:return qe(t.type)&&ni(),Ge(t),null;case 19:if(ve(Ee),l=t.memoizedState,l===null)return Ge(t),null;if(r=(t.flags&128)!==0,a=l.rendering,a===null)if(r)Sr(l,!1);else{if(_e!==0||e!==null&&(e.flags&128)!==0)for(e=t.child;e!==null;){if(a=fi(e),a!==null){for(t.flags|=128,Sr(l,!1),r=a.updateQueue,r!==null&&(t.updateQueue=r,t.flags|=4),t.subtreeFlags=0,r=n,n=t.child;n!==null;)l=n,e=r,l.flags&=14680066,a=l.alternate,a===null?(l.childLanes=0,l.lanes=e,l.child=null,l.subtreeFlags=0,l.memoizedProps=null,l.memoizedState=null,l.updateQueue=null,l.dependencies=null,l.stateNode=null):(l.childLanes=a.childLanes,l.lanes=a.lanes,l.child=a.child,l.subtreeFlags=0,l.deletions=null,l.memoizedProps=a.memoizedProps,l.memoizedState=a.memoizedState,l.updateQueue=a.updateQueue,l.type=a.type,e=a.dependencies,l.dependencies=e===null?null:{lanes:e.lanes,firstContext:e.firstContext}),n=n.sibling;return ge(Ee,Ee.current&1|2),t.child}e=e.sibling}l.tail!==null&&Re()>zn&&(t.flags|=128,r=!0,Sr(l,!1),t.lanes=4194304)}else{if(!r)if(e=fi(a),e!==null){if(t.flags|=128,r=!0,n=e.updateQueue,n!==null&&(t.updateQueue=n,t.flags|=4),Sr(l,!0),l.tail===null&&l.tailMode==="hidden"&&!a.alternate&&!we)return Ge(t),null}else 2*Re()-l.renderingStartTime>zn&&n!==1073741824&&(t.flags|=128,r=!0,Sr(l,!1),t.lanes=4194304);l.isBackwards?(a.sibling=t.child,t.child=a):(n=l.last,n!==null?n.sibling=a:t.child=a,l.last=a)}return l.tail!==null?(t=l.tail,l.rendering=t,l.tail=t.sibling,l.renderingStartTime=Re(),t.sibling=null,n=Ee.current,ge(Ee,r?n&1|2:n&1),t):(Ge(t),null);case 22:case 23:return Ca(),r=t.memoizedState!==null,e!==null&&e.memoizedState!==null!==r&&(t.flags|=8192),r&&(t.mode&1)!==0?(lt&1073741824)!==0&&(Ge(t),t.subtreeFlags&6&&(t.flags|=8192)):Ge(t),null;case 24:return null;case 25:return null}throw Error(o(156,t.tag))}function _p(e,t){switch(Ll(t),t.tag){case 1:return qe(t.type)&&ni(),e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 3:return Pn(),ve(Ye),ve(ze),Kl(),e=t.flags,(e&65536)!==0&&(e&128)===0?(t.flags=e&-65537|128,t):null;case 5:return Hl(t),null;case 13:if(ve(Ee),e=t.memoizedState,e!==null&&e.dehydrated!==null){if(t.alternate===null)throw Error(o(340));_n()}return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 19:return ve(Ee),null;case 4:return Pn(),null;case 10:return jl(t.type._context),null;case 22:case 23:return Ca(),null;case 24:return null;default:return null}}var Si=!1,Fe=!1,Lp=typeof WeakSet=="function"?WeakSet:Set,D=null;function Wn(e,t){var n=e.ref;if(n!==null)if(typeof n=="function")try{n(null)}catch(r){ke(e,t,r)}else n.current=null}function da(e,t,n){try{n()}catch(r){ke(e,t,r)}}var cu=!1;function Bp(e,t){if(Cl=Gr,e=Go(),ml(e)){if("selectionStart"in e)var n={start:e.selectionStart,end:e.selectionEnd};else e:{n=(n=e.ownerDocument)&&n.defaultView||window;var r=n.getSelection&&n.getSelection();if(r&&r.rangeCount!==0){n=r.anchorNode;var i=r.anchorOffset,l=r.focusNode;r=r.focusOffset;try{n.nodeType,l.nodeType}catch{n=null;break e}var a=0,s=-1,c=-1,g=0,S=0,k=e,E=null;t:for(;;){for(var _;k!==n||i!==0&&k.nodeType!==3||(s=a+i),k!==l||r!==0&&k.nodeType!==3||(c=a+r),k.nodeType===3&&(a+=k.nodeValue.length),(_=k.firstChild)!==null;)E=k,k=_;for(;;){if(k===e)break t;if(E===n&&++g===i&&(s=a),E===l&&++S===r&&(c=a),(_=k.nextSibling)!==null)break;k=E,E=k.parentNode}k=_}n=s===-1||c===-1?null:{start:s,end:c}}else n=null}n=n||{start:0,end:0}}else n=null;for(Rl={focusedElem:e,selectionRange:n},Gr=!1,D=t;D!==null;)if(t=D,e=t.child,(t.subtreeFlags&1028)!==0&&e!==null)e.return=t,D=e;else for(;D!==null;){t=D;try{var M=t.alternate;if((t.flags&1024)!==0)switch(t.tag){case 0:case 11:case 15:break;case 1:if(M!==null){var j=M.memoizedProps,Te=M.memoizedState,f=t.stateNode,p=f.getSnapshotBeforeUpdate(t.elementType===t.type?j:mt(t.type,j),Te);f.__reactInternalSnapshotBeforeUpdate=p}break;case 3:var h=t.stateNode.containerInfo;h.nodeType===1?h.textContent="":h.nodeType===9&&h.documentElement&&h.removeChild(h.documentElement);break;case 5:case 6:case 4:case 17:break;default:throw Error(o(163))}}catch(R){ke(t,t.return,R)}if(e=t.sibling,e!==null){e.return=t.return,D=e;break}D=t.return}return M=cu,cu=!1,M}function kr(e,t,n){var r=t.updateQueue;if(r=r!==null?r.lastEffect:null,r!==null){var i=r=r.next;do{if((i.tag&e)===e){var l=i.destroy;i.destroy=void 0,l!==void 0&&da(t,n,l)}i=i.next}while(i!==r)}}function ki(e,t){if(t=t.updateQueue,t=t!==null?t.lastEffect:null,t!==null){var n=t=t.next;do{if((n.tag&e)===e){var r=n.create;n.destroy=r()}n=n.next}while(n!==t)}}function fa(e){var t=e.ref;if(t!==null){var n=e.stateNode;switch(e.tag){case 5:e=n;break;default:e=n}typeof t=="function"?t(e):t.current=e}}function pu(e){var t=e.alternate;t!==null&&(e.alternate=null,pu(t)),e.child=null,e.deletions=null,e.sibling=null,e.tag===5&&(t=e.stateNode,t!==null&&(delete t[St],delete t[dr],delete t[Al],delete t[mp],delete t[yp])),e.stateNode=null,e.return=null,e.dependencies=null,e.memoizedProps=null,e.memoizedState=null,e.pendingProps=null,e.stateNode=null,e.updateQueue=null}function du(e){return e.tag===5||e.tag===3||e.tag===4}function fu(e){e:for(;;){for(;e.sibling===null;){if(e.return===null||du(e.return))return null;e=e.return}for(e.sibling.return=e.return,e=e.sibling;e.tag!==5&&e.tag!==6&&e.tag!==18;){if(e.flags&2||e.child===null||e.tag===4)continue e;e.child.return=e,e=e.child}if(!(e.flags&2))return e.stateNode}}function ha(e,t,n){var r=e.tag;if(r===5||r===6)e=e.stateNode,t?n.nodeType===8?n.parentNode.insertBefore(e,t):n.insertBefore(e,t):(n.nodeType===8?(t=n.parentNode,t.insertBefore(e,n)):(t=n,t.appendChild(e)),n=n._reactRootContainer,n!=null||t.onclick!==null||(t.onclick=ei));else if(r!==4&&(e=e.child,e!==null))for(ha(e,t,n),e=e.sibling;e!==null;)ha(e,t,n),e=e.sibling}function ga(e,t,n){var r=e.tag;if(r===5||r===6)e=e.stateNode,t?n.insertBefore(e,t):n.appendChild(e);else if(r!==4&&(e=e.child,e!==null))for(ga(e,t,n),e=e.sibling;e!==null;)ga(e,t,n),e=e.sibling}var Me=null,yt=!1;function qt(e,t,n){for(n=n.child;n!==null;)hu(e,t,n),n=n.sibling}function hu(e,t,n){if(Et&&typeof Et.onCommitFiberUnmount=="function")try{Et.onCommitFiberUnmount(Pr,n)}catch{}switch(n.tag){case 5:Fe||Wn(n,t);case 6:var r=Me,i=yt;Me=null,qt(e,t,n),Me=r,yt=i,Me!==null&&(yt?(e=Me,n=n.stateNode,e.nodeType===8?e.parentNode.removeChild(n):e.removeChild(n)):Me.removeChild(n.stateNode));break;case 18:Me!==null&&(yt?(e=Me,n=n.stateNode,e.nodeType===8?Nl(e.parentNode,n):e.nodeType===1&&Nl(e,n),tr(e)):Nl(Me,n.stateNode));break;case 4:r=Me,i=yt,Me=n.stateNode.containerInfo,yt=!0,qt(e,t,n),Me=r,yt=i;break;case 0:case 11:case 14:case 15:if(!Fe&&(r=n.updateQueue,r!==null&&(r=r.lastEffect,r!==null))){i=r=r.next;do{var l=i,a=l.destroy;l=l.tag,a!==void 0&&((l&2)!==0||(l&4)!==0)&&da(n,t,a),i=i.next}while(i!==r)}qt(e,t,n);break;case 1:if(!Fe&&(Wn(n,t),r=n.stateNode,typeof r.componentWillUnmount=="function"))try{r.props=n.memoizedProps,r.state=n.memoizedState,r.componentWillUnmount()}catch(s){ke(n,t,s)}qt(e,t,n);break;case 21:qt(e,t,n);break;case 22:n.mode&1?(Fe=(r=Fe)||n.memoizedState!==null,qt(e,t,n),Fe=r):qt(e,t,n);break;default:qt(e,t,n)}}function gu(e){var t=e.updateQueue;if(t!==null){e.updateQueue=null;var n=e.stateNode;n===null&&(n=e.stateNode=new Lp),t.forEach(function(r){var i=Fp.bind(null,e,r);n.has(r)||(n.add(r),r.then(i,i))})}}function vt(e,t){var n=t.deletions;if(n!==null)for(var r=0;r<n.length;r++){var i=n[r];try{var l=e,a=t,s=a;e:for(;s!==null;){switch(s.tag){case 5:Me=s.stateNode,yt=!1;break e;case 3:Me=s.stateNode.containerInfo,yt=!0;break e;case 4:Me=s.stateNode.containerInfo,yt=!0;break e}s=s.return}if(Me===null)throw Error(o(160));hu(l,a,i),Me=null,yt=!1;var c=i.alternate;c!==null&&(c.return=null),i.return=null}catch(g){ke(i,t,g)}}if(t.subtreeFlags&12854)for(t=t.child;t!==null;)mu(t,e),t=t.sibling}function mu(e,t){var n=e.alternate,r=e.flags;switch(e.tag){case 0:case 11:case 14:case 15:if(vt(t,e),Rt(e),r&4){try{kr(3,e,e.return),ki(3,e)}catch(j){ke(e,e.return,j)}try{kr(5,e,e.return)}catch(j){ke(e,e.return,j)}}break;case 1:vt(t,e),Rt(e),r&512&&n!==null&&Wn(n,n.return);break;case 5:if(vt(t,e),Rt(e),r&512&&n!==null&&Wn(n,n.return),e.flags&32){var i=e.stateNode;try{Hn(i,"")}catch(j){ke(e,e.return,j)}}if(r&4&&(i=e.stateNode,i!=null)){var l=e.memoizedProps,a=n!==null?n.memoizedProps:l,s=e.type,c=e.updateQueue;if(e.updateQueue=null,c!==null)try{s==="input"&&l.type==="radio"&&l.name!=null&&Tt(i,l),Ki(s,a);var g=Ki(s,l);for(a=0;a<c.length;a+=2){var S=c[a],k=c[a+1];S==="style"?Xa(i,k):S==="dangerouslySetInnerHTML"?qa(i,k):S==="children"?Hn(i,k):me(i,S,k,g)}switch(s){case"input":Gn(i,l);break;case"textarea":Ka(i,l);break;case"select":var E=i._wrapperState.wasMultiple;i._wrapperState.wasMultiple=!!l.multiple;var _=l.value;_!=null?yn(i,!!l.multiple,_,!1):E!==!!l.multiple&&(l.defaultValue!=null?yn(i,!!l.multiple,l.defaultValue,!0):yn(i,!!l.multiple,l.multiple?[]:"",!1))}i[dr]=l}catch(j){ke(e,e.return,j)}}break;case 6:if(vt(t,e),Rt(e),r&4){if(e.stateNode===null)throw Error(o(162));i=e.stateNode,l=e.memoizedProps;try{i.nodeValue=l}catch(j){ke(e,e.return,j)}}break;case 3:if(vt(t,e),Rt(e),r&4&&n!==null&&n.memoizedState.isDehydrated)try{tr(t.containerInfo)}catch(j){ke(e,e.return,j)}break;case 4:vt(t,e),Rt(e);break;case 13:vt(t,e),Rt(e),i=e.child,i.flags&8192&&(l=i.memoizedState!==null,i.stateNode.isHidden=l,!l||i.alternate!==null&&i.alternate.memoizedState!==null||(va=Re())),r&4&&gu(e);break;case 22:if(S=n!==null&&n.memoizedState!==null,e.mode&1?(Fe=(g=Fe)||S,vt(t,e),Fe=g):vt(t,e),Rt(e),r&8192){if(g=e.memoizedState!==null,(e.stateNode.isHidden=g)&&!S&&(e.mode&1)!==0)for(D=e,S=e.child;S!==null;){for(k=D=S;D!==null;){switch(E=D,_=E.child,E.tag){case 0:case 11:case 14:case 15:kr(4,E,E.return);break;case 1:Wn(E,E.return);var M=E.stateNode;if(typeof M.componentWillUnmount=="function"){r=E,n=E.return;try{t=r,M.props=t.memoizedProps,M.state=t.memoizedState,M.componentWillUnmount()}catch(j){ke(r,n,j)}}break;case 5:Wn(E,E.return);break;case 22:if(E.memoizedState!==null){xu(k);continue}}_!==null?(_.return=E,D=_):xu(k)}S=S.sibling}e:for(S=null,k=e;;){if(k.tag===5){if(S===null){S=k;try{i=k.stateNode,g?(l=i.style,typeof l.setProperty=="function"?l.setProperty("display","none","important"):l.display="none"):(s=k.stateNode,c=k.memoizedProps.style,a=c!=null&&c.hasOwnProperty("display")?c.display:null,s.style.display=Qa("display",a))}catch(j){ke(e,e.return,j)}}}else if(k.tag===6){if(S===null)try{k.stateNode.nodeValue=g?"":k.memoizedProps}catch(j){ke(e,e.return,j)}}else if((k.tag!==22&&k.tag!==23||k.memoizedState===null||k===e)&&k.child!==null){k.child.return=k,k=k.child;continue}if(k===e)break e;for(;k.sibling===null;){if(k.return===null||k.return===e)break e;S===k&&(S=null),k=k.return}S===k&&(S=null),k.sibling.return=k.return,k=k.sibling}}break;case 19:vt(t,e),Rt(e),r&4&&gu(e);break;case 21:break;default:vt(t,e),Rt(e)}}function Rt(e){var t=e.flags;if(t&2){try{e:{for(var n=e.return;n!==null;){if(du(n)){var r=n;break e}n=n.return}throw Error(o(160))}switch(r.tag){case 5:var i=r.stateNode;r.flags&32&&(Hn(i,""),r.flags&=-33);var l=fu(e);ga(e,l,i);break;case 3:case 4:var a=r.stateNode.containerInfo,s=fu(e);ha(e,s,a);break;default:throw Error(o(161))}}catch(c){ke(e,e.return,c)}e.flags&=-3}t&4096&&(e.flags&=-4097)}function Dp(e,t,n){D=e,yu(e)}function yu(e,t,n){for(var r=(e.mode&1)!==0;D!==null;){var i=D,l=i.child;if(i.tag===22&&r){var a=i.memoizedState!==null||Si;if(!a){var s=i.alternate,c=s!==null&&s.memoizedState!==null||Fe;s=Si;var g=Fe;if(Si=a,(Fe=c)&&!g)for(D=i;D!==null;)a=D,c=a.child,a.tag===22&&a.memoizedState!==null?wu(i):c!==null?(c.return=a,D=c):wu(i);for(;l!==null;)D=l,yu(l),l=l.sibling;D=i,Si=s,Fe=g}vu(e)}else(i.subtreeFlags&8772)!==0&&l!==null?(l.return=i,D=l):vu(e)}}function vu(e){for(;D!==null;){var t=D;if((t.flags&8772)!==0){var n=t.alternate;try{if((t.flags&8772)!==0)switch(t.tag){case 0:case 11:case 15:Fe||ki(5,t);break;case 1:var r=t.stateNode;if(t.flags&4&&!Fe)if(n===null)r.componentDidMount();else{var i=t.elementType===t.type?n.memoizedProps:mt(t.type,n.memoizedProps);r.componentDidUpdate(i,n.memoizedState,r.__reactInternalSnapshotBeforeUpdate)}var l=t.updateQueue;l!==null&&xs(t,l,r);break;case 3:var a=t.updateQueue;if(a!==null){if(n=null,t.child!==null)switch(t.child.tag){case 5:n=t.child.stateNode;break;case 1:n=t.child.stateNode}xs(t,a,n)}break;case 5:var s=t.stateNode;if(n===null&&t.flags&4){n=s;var c=t.memoizedProps;switch(t.type){case"button":case"input":case"select":case"textarea":c.autoFocus&&n.focus();break;case"img":c.src&&(n.src=c.src)}}break;case 6:break;case 4:break;case 12:break;case 13:if(t.memoizedState===null){var g=t.alternate;if(g!==null){var S=g.memoizedState;if(S!==null){var k=S.dehydrated;k!==null&&tr(k)}}}break;case 19:case 17:case 21:case 22:case 23:case 25:break;default:throw Error(o(163))}Fe||t.flags&512&&fa(t)}catch(E){ke(t,t.return,E)}}if(t===e){D=null;break}if(n=t.sibling,n!==null){n.return=t.return,D=n;break}D=t.return}}function xu(e){for(;D!==null;){var t=D;if(t===e){D=null;break}var n=t.sibling;if(n!==null){n.return=t.return,D=n;break}D=t.return}}function wu(e){for(;D!==null;){var t=D;try{switch(t.tag){case 0:case 11:case 15:var n=t.return;try{ki(4,t)}catch(c){ke(t,n,c)}break;case 1:var r=t.stateNode;if(typeof r.componentDidMount=="function"){var i=t.return;try{r.componentDidMount()}catch(c){ke(t,i,c)}}var l=t.return;try{fa(t)}catch(c){ke(t,l,c)}break;case 5:var a=t.return;try{fa(t)}catch(c){ke(t,a,c)}}}catch(c){ke(t,t.return,c)}if(t===e){D=null;break}var s=t.sibling;if(s!==null){s.return=t.return,D=s;break}D=t.return}}var Pp=Math.ceil,Ci=oe.ReactCurrentDispatcher,ma=oe.ReactCurrentOwner,pt=oe.ReactCurrentBatchConfig,ae=0,De=null,Ne=null,We=0,lt=0,jn=Ht(0),_e=0,Cr=null,pn=0,Ri=0,ya=0,Rr=null,Xe=null,va=0,zn=1/0,Bt=null,Ti=!1,xa=null,Qt=null,bi=!1,Xt=null,Ni=0,Tr=0,wa=null,Ai=-1,Oi=0;function Ke(){return(ae&6)!==0?Re():Ai!==-1?Ai:Ai=Re()}function Zt(e){return(e.mode&1)===0?1:(ae&2)!==0&&We!==0?We&-We:xp.transition!==null?(Oi===0&&(Oi=fo()),Oi):(e=de,e!==0||(e=window.event,e=e===void 0?16:So(e.type)),e)}function xt(e,t,n,r){if(50<Tr)throw Tr=0,wa=null,Error(o(185));Qn(e,n,r),((ae&2)===0||e!==De)&&(e===De&&((ae&2)===0&&(Ri|=n),_e===4&&Jt(e,We)),Ze(e,r),n===1&&ae===0&&(t.mode&1)===0&&(zn=Re()+500,ii&&Kt()))}function Ze(e,t){var n=e.callbackNode;xc(e,t);var r=jr(e,e===De?We:0);if(r===0)n!==null&&uo(n),e.callbackNode=null,e.callbackPriority=0;else if(t=r&-r,e.callbackPriority!==t){if(n!=null&&uo(n),t===1)e.tag===0?vp(Su.bind(null,e)):os(Su.bind(null,e)),hp(function(){(ae&6)===0&&Kt()}),n=null;else{switch(ho(r)){case 1:n=Ji;break;case 4:n=co;break;case 16:n=Dr;break;case 536870912:n=po;break;default:n=Dr}n=Ou(n,Eu.bind(null,e))}e.callbackPriority=t,e.callbackNode=n}}function Eu(e,t){if(Ai=-1,Oi=0,(ae&6)!==0)throw Error(o(327));var n=e.callbackNode;if(Un()&&e.callbackNode!==n)return null;var r=jr(e,e===De?We:0);if(r===0)return null;if((r&30)!==0||(r&e.expiredLanes)!==0||t)t=Ii(e,r);else{t=r;var i=ae;ae|=2;var l=Cu();(De!==e||We!==t)&&(Bt=null,zn=Re()+500,fn(e,t));do try{jp();break}catch(s){ku(e,s)}while(!0);Wl(),Ci.current=l,ae=i,Ne!==null?t=0:(De=null,We=0,t=_e)}if(t!==0){if(t===2&&(i=el(e),i!==0&&(r=i,t=Ea(e,i))),t===1)throw n=Cr,fn(e,0),Jt(e,r),Ze(e,Re()),n;if(t===6)Jt(e,r);else{if(i=e.current.alternate,(r&30)===0&&!Mp(i)&&(t=Ii(e,r),t===2&&(l=el(e),l!==0&&(r=l,t=Ea(e,l))),t===1))throw n=Cr,fn(e,0),Jt(e,r),Ze(e,Re()),n;switch(e.finishedWork=i,e.finishedLanes=r,t){case 0:case 1:throw Error(o(345));case 2:hn(e,Xe,Bt);break;case 3:if(Jt(e,r),(r&130023424)===r&&(t=va+500-Re(),10<t)){if(jr(e,0)!==0)break;if(i=e.suspendedLanes,(i&r)!==r){Ke(),e.pingedLanes|=e.suspendedLanes&i;break}e.timeoutHandle=bl(hn.bind(null,e,Xe,Bt),t);break}hn(e,Xe,Bt);break;case 4:if(Jt(e,r),(r&4194240)===r)break;for(t=e.eventTimes,i=-1;0<r;){var a=31-ft(r);l=1<<a,a=t[a],a>i&&(i=a),r&=~l}if(r=i,r=Re()-r,r=(120>r?120:480>r?480:1080>r?1080:1920>r?1920:3e3>r?3e3:4320>r?4320:1960*Pp(r/1960))-r,10<r){e.timeoutHandle=bl(hn.bind(null,e,Xe,Bt),r);break}hn(e,Xe,Bt);break;case 5:hn(e,Xe,Bt);break;default:throw Error(o(329))}}}return Ze(e,Re()),e.callbackNode===n?Eu.bind(null,e):null}function Ea(e,t){var n=Rr;return e.current.memoizedState.isDehydrated&&(fn(e,t).flags|=256),e=Ii(e,t),e!==2&&(t=Xe,Xe=n,t!==null&&Sa(t)),e}function Sa(e){Xe===null?Xe=e:Xe.push.apply(Xe,e)}function Mp(e){for(var t=e;;){if(t.flags&16384){var n=t.updateQueue;if(n!==null&&(n=n.stores,n!==null))for(var r=0;r<n.length;r++){var i=n[r],l=i.getSnapshot;i=i.value;try{if(!ht(l(),i))return!1}catch{return!1}}}if(n=t.child,t.subtreeFlags&16384&&n!==null)n.return=t,t=n;else{if(t===e)break;for(;t.sibling===null;){if(t.return===null||t.return===e)return!0;t=t.return}t.sibling.return=t.return,t=t.sibling}}return!0}function Jt(e,t){for(t&=~ya,t&=~Ri,e.suspendedLanes|=t,e.pingedLanes&=~t,e=e.expirationTimes;0<t;){var n=31-ft(t),r=1<<n;e[n]=-1,t&=~r}}function Su(e){if((ae&6)!==0)throw Error(o(327));Un();var t=jr(e,0);if((t&1)===0)return Ze(e,Re()),null;var n=Ii(e,t);if(e.tag!==0&&n===2){var r=el(e);r!==0&&(t=r,n=Ea(e,r))}if(n===1)throw n=Cr,fn(e,0),Jt(e,t),Ze(e,Re()),n;if(n===6)throw Error(o(345));return e.finishedWork=e.current.alternate,e.finishedLanes=t,hn(e,Xe,Bt),Ze(e,Re()),null}function ka(e,t){var n=ae;ae|=1;try{return e(t)}finally{ae=n,ae===0&&(zn=Re()+500,ii&&Kt())}}function dn(e){Xt!==null&&Xt.tag===0&&(ae&6)===0&&Un();var t=ae;ae|=1;var n=pt.transition,r=de;try{if(pt.transition=null,de=1,e)return e()}finally{de=r,pt.transition=n,ae=t,(ae&6)===0&&Kt()}}function Ca(){lt=jn.current,ve(jn)}function fn(e,t){e.finishedWork=null,e.finishedLanes=0;var n=e.timeoutHandle;if(n!==-1&&(e.timeoutHandle=-1,fp(n)),Ne!==null)for(n=Ne.return;n!==null;){var r=n;switch(Ll(r),r.tag){case 1:r=r.type.childContextTypes,r!=null&&ni();break;case 3:Pn(),ve(Ye),ve(ze),Kl();break;case 5:Hl(r);break;case 4:Pn();break;case 13:ve(Ee);break;case 19:ve(Ee);break;case 10:jl(r.type._context);break;case 22:case 23:Ca()}n=n.return}if(De=e,Ne=e=en(e.current,null),We=lt=t,_e=0,Cr=null,ya=Ri=pn=0,Xe=Rr=null,sn!==null){for(t=0;t<sn.length;t++)if(n=sn[t],r=n.interleaved,r!==null){n.interleaved=null;var i=r.next,l=n.pending;if(l!==null){var a=l.next;l.next=i,r.next=a}n.pending=r}sn=null}return e}function ku(e,t){do{var n=Ne;try{if(Wl(),hi.current=vi,gi){for(var r=Se.memoizedState;r!==null;){var i=r.queue;i!==null&&(i.pending=null),r=r.next}gi=!1}if(cn=0,Be=Ie=Se=null,vr=!1,xr=0,ma.current=null,n===null||n.return===null){_e=1,Cr=t,Ne=null;break}e:{var l=e,a=n.return,s=n,c=t;if(t=We,s.flags|=32768,c!==null&&typeof c=="object"&&typeof c.then=="function"){var g=c,S=s,k=S.tag;if((S.mode&1)===0&&(k===0||k===11||k===15)){var E=S.alternate;E?(S.updateQueue=E.updateQueue,S.memoizedState=E.memoizedState,S.lanes=E.lanes):(S.updateQueue=null,S.memoizedState=null)}var _=Ys(a);if(_!==null){_.flags&=-257,qs(_,a,s,l,t),_.mode&1&&Vs(l,g,t),t=_,c=g;var M=t.updateQueue;if(M===null){var j=new Set;j.add(c),t.updateQueue=j}else M.add(c);break e}else{if((t&1)===0){Vs(l,g,t),Ra();break e}c=Error(o(426))}}else if(we&&s.mode&1){var Te=Ys(a);if(Te!==null){(Te.flags&65536)===0&&(Te.flags|=256),qs(Te,a,s,l,t),Pl(Mn(c,s));break e}}l=c=Mn(c,s),_e!==4&&(_e=2),Rr===null?Rr=[l]:Rr.push(l),l=a;do{switch(l.tag){case 3:l.flags|=65536,t&=-t,l.lanes|=t;var f=$s(l,c,t);vs(l,f);break e;case 1:s=c;var p=l.type,h=l.stateNode;if((l.flags&128)===0&&(typeof p.getDerivedStateFromError=="function"||h!==null&&typeof h.componentDidCatch=="function"&&(Qt===null||!Qt.has(h)))){l.flags|=65536,t&=-t,l.lanes|=t;var R=Ks(l,s,t);vs(l,R);break e}}l=l.return}while(l!==null)}Tu(n)}catch(G){t=G,Ne===n&&n!==null&&(Ne=n=n.return);continue}break}while(!0)}function Cu(){var e=Ci.current;return Ci.current=vi,e===null?vi:e}function Ra(){(_e===0||_e===3||_e===2)&&(_e=4),De===null||(pn&268435455)===0&&(Ri&268435455)===0||Jt(De,We)}function Ii(e,t){var n=ae;ae|=2;var r=Cu();(De!==e||We!==t)&&(Bt=null,fn(e,t));do try{Wp();break}catch(i){ku(e,i)}while(!0);if(Wl(),ae=n,Ci.current=r,Ne!==null)throw Error(o(261));return De=null,We=0,_e}function Wp(){for(;Ne!==null;)Ru(Ne)}function jp(){for(;Ne!==null&&!cc();)Ru(Ne)}function Ru(e){var t=Au(e.alternate,e,lt);e.memoizedProps=e.pendingProps,t===null?Tu(e):Ne=t,ma.current=null}function Tu(e){var t=e;do{var n=t.alternate;if(e=t.return,(t.flags&32768)===0){if(n=Ip(n,t,lt),n!==null){Ne=n;return}}else{if(n=_p(n,t),n!==null){n.flags&=32767,Ne=n;return}if(e!==null)e.flags|=32768,e.subtreeFlags=0,e.deletions=null;else{_e=6,Ne=null;return}}if(t=t.sibling,t!==null){Ne=t;return}Ne=t=e}while(t!==null);_e===0&&(_e=5)}function hn(e,t,n){var r=de,i=pt.transition;try{pt.transition=null,de=1,zp(e,t,n,r)}finally{pt.transition=i,de=r}return null}function zp(e,t,n,r){do Un();while(Xt!==null);if((ae&6)!==0)throw Error(o(327));n=e.finishedWork;var i=e.finishedLanes;if(n===null)return null;if(e.finishedWork=null,e.finishedLanes=0,n===e.current)throw Error(o(177));e.callbackNode=null,e.callbackPriority=0;var l=n.lanes|n.childLanes;if(wc(e,l),e===De&&(Ne=De=null,We=0),(n.subtreeFlags&2064)===0&&(n.flags&2064)===0||bi||(bi=!0,Ou(Dr,function(){return Un(),null})),l=(n.flags&15990)!==0,(n.subtreeFlags&15990)!==0||l){l=pt.transition,pt.transition=null;var a=de;de=1;var s=ae;ae|=4,ma.current=null,Bp(e,n),mu(n,e),ap(Rl),Gr=!!Cl,Rl=Cl=null,e.current=n,Dp(n),pc(),ae=s,de=a,pt.transition=l}else e.current=n;if(bi&&(bi=!1,Xt=e,Ni=i),l=e.pendingLanes,l===0&&(Qt=null),hc(n.stateNode),Ze(e,Re()),t!==null)for(r=e.onRecoverableError,n=0;n<t.length;n++)i=t[n],r(i.value,{componentStack:i.stack,digest:i.digest});if(Ti)throw Ti=!1,e=xa,xa=null,e;return(Ni&1)!==0&&e.tag!==0&&Un(),l=e.pendingLanes,(l&1)!==0?e===wa?Tr++:(Tr=0,wa=e):Tr=0,Kt(),null}function Un(){if(Xt!==null){var e=ho(Ni),t=pt.transition,n=de;try{if(pt.transition=null,de=16>e?16:e,Xt===null)var r=!1;else{if(e=Xt,Xt=null,Ni=0,(ae&6)!==0)throw Error(o(331));var i=ae;for(ae|=4,D=e.current;D!==null;){var l=D,a=l.child;if((D.flags&16)!==0){var s=l.deletions;if(s!==null){for(var c=0;c<s.length;c++){var g=s[c];for(D=g;D!==null;){var S=D;switch(S.tag){case 0:case 11:case 15:kr(8,S,l)}var k=S.child;if(k!==null)k.return=S,D=k;else for(;D!==null;){S=D;var E=S.sibling,_=S.return;if(pu(S),S===g){D=null;break}if(E!==null){E.return=_,D=E;break}D=_}}}var M=l.alternate;if(M!==null){var j=M.child;if(j!==null){M.child=null;do{var Te=j.sibling;j.sibling=null,j=Te}while(j!==null)}}D=l}}if((l.subtreeFlags&2064)!==0&&a!==null)a.return=l,D=a;else e:for(;D!==null;){if(l=D,(l.flags&2048)!==0)switch(l.tag){case 0:case 11:case 15:kr(9,l,l.return)}var f=l.sibling;if(f!==null){f.return=l.return,D=f;break e}D=l.return}}var p=e.current;for(D=p;D!==null;){a=D;var h=a.child;if((a.subtreeFlags&2064)!==0&&h!==null)h.return=a,D=h;else e:for(a=p;D!==null;){if(s=D,(s.flags&2048)!==0)try{switch(s.tag){case 0:case 11:case 15:ki(9,s)}}catch(G){ke(s,s.return,G)}if(s===a){D=null;break e}var R=s.sibling;if(R!==null){R.return=s.return,D=R;break e}D=s.return}}if(ae=i,Kt(),Et&&typeof Et.onPostCommitFiberRoot=="function")try{Et.onPostCommitFiberRoot(Pr,e)}catch{}r=!0}return r}finally{de=n,pt.transition=t}}return!1}function bu(e,t,n){t=Mn(n,t),t=$s(e,t,1),e=Yt(e,t,1),t=Ke(),e!==null&&(Qn(e,1,t),Ze(e,t))}function ke(e,t,n){if(e.tag===3)bu(e,e,n);else for(;t!==null;){if(t.tag===3){bu(t,e,n);break}else if(t.tag===1){var r=t.stateNode;if(typeof t.type.getDerivedStateFromError=="function"||typeof r.componentDidCatch=="function"&&(Qt===null||!Qt.has(r))){e=Mn(n,e),e=Ks(t,e,1),t=Yt(t,e,1),e=Ke(),t!==null&&(Qn(t,1,e),Ze(t,e));break}}t=t.return}}function Up(e,t,n){var r=e.pingCache;r!==null&&r.delete(t),t=Ke(),e.pingedLanes|=e.suspendedLanes&n,De===e&&(We&n)===n&&(_e===4||_e===3&&(We&130023424)===We&&500>Re()-va?fn(e,0):ya|=n),Ze(e,t)}function Nu(e,t){t===0&&((e.mode&1)===0?t=1:(t=Wr,Wr<<=1,(Wr&130023424)===0&&(Wr=4194304)));var n=Ke();e=It(e,t),e!==null&&(Qn(e,t,n),Ze(e,n))}function Gp(e){var t=e.memoizedState,n=0;t!==null&&(n=t.retryLane),Nu(e,n)}function Fp(e,t){var n=0;switch(e.tag){case 13:var r=e.stateNode,i=e.memoizedState;i!==null&&(n=i.retryLane);break;case 19:r=e.stateNode;break;default:throw Error(o(314))}r!==null&&r.delete(t),Nu(e,n)}var Au;Au=function(e,t,n){if(e!==null)if(e.memoizedProps!==t.pendingProps||Ye.current)Qe=!0;else{if((e.lanes&n)===0&&(t.flags&128)===0)return Qe=!1,Op(e,t,n);Qe=(e.flags&131072)!==0}else Qe=!1,we&&(t.flags&1048576)!==0&&ss(t,ai,t.index);switch(t.lanes=0,t.tag){case 2:var r=t.type;Ei(e,t),e=t.pendingProps;var i=An(t,ze.current);Dn(t,n),i=ql(null,t,r,e,i,n);var l=Ql();return t.flags|=1,typeof i=="object"&&i!==null&&typeof i.render=="function"&&i.$$typeof===void 0?(t.tag=1,t.memoizedState=null,t.updateQueue=null,qe(r)?(l=!0,ri(t)):l=!1,t.memoizedState=i.state!==null&&i.state!==void 0?i.state:null,Gl(t),i.updater=xi,t.stateNode=i,i._reactInternals=t,na(t,r,e,n),t=aa(null,t,r,!0,l,n)):(t.tag=0,we&&l&&_l(t),$e(null,t,i,n),t=t.child),t;case 16:r=t.elementType;e:{switch(Ei(e,t),e=t.pendingProps,i=r._init,r=i(r._payload),t.type=r,i=t.tag=$p(r),e=mt(r,e),i){case 0:t=la(null,t,r,e,n);break e;case 1:t=tu(null,t,r,e,n);break e;case 11:t=Qs(null,t,r,e,n);break e;case 14:t=Xs(null,t,r,mt(r.type,e),n);break e}throw Error(o(306,r,""))}return t;case 0:return r=t.type,i=t.pendingProps,i=t.elementType===r?i:mt(r,i),la(e,t,r,i,n);case 1:return r=t.type,i=t.pendingProps,i=t.elementType===r?i:mt(r,i),tu(e,t,r,i,n);case 3:e:{if(nu(t),e===null)throw Error(o(387));r=t.pendingProps,l=t.memoizedState,i=l.element,ys(e,t),di(t,r,null,n);var a=t.memoizedState;if(r=a.element,l.isDehydrated)if(l={element:r,isDehydrated:!1,cache:a.cache,pendingSuspenseBoundaries:a.pendingSuspenseBoundaries,transitions:a.transitions},t.updateQueue.baseState=l,t.memoizedState=l,t.flags&256){i=Mn(Error(o(423)),t),t=ru(e,t,r,n,i);break e}else if(r!==i){i=Mn(Error(o(424)),t),t=ru(e,t,r,n,i);break e}else for(it=Ft(t.stateNode.containerInfo.firstChild),rt=t,we=!0,gt=null,n=gs(t,null,r,n),t.child=n;n;)n.flags=n.flags&-3|4096,n=n.sibling;else{if(_n(),r===i){t=Lt(e,t,n);break e}$e(e,t,r,n)}t=t.child}return t;case 5:return ws(t),e===null&&Dl(t),r=t.type,i=t.pendingProps,l=e!==null?e.memoizedProps:null,a=i.children,Tl(r,i)?a=null:l!==null&&Tl(r,l)&&(t.flags|=32),eu(e,t),$e(e,t,a,n),t.child;case 6:return e===null&&Dl(t),null;case 13:return iu(e,t,n);case 4:return Fl(t,t.stateNode.containerInfo),r=t.pendingProps,e===null?t.child=Ln(t,null,r,n):$e(e,t,r,n),t.child;case 11:return r=t.type,i=t.pendingProps,i=t.elementType===r?i:mt(r,i),Qs(e,t,r,i,n);case 7:return $e(e,t,t.pendingProps,n),t.child;case 8:return $e(e,t,t.pendingProps.children,n),t.child;case 12:return $e(e,t,t.pendingProps.children,n),t.child;case 10:e:{if(r=t.type._context,i=t.pendingProps,l=t.memoizedProps,a=i.value,ge(ui,r._currentValue),r._currentValue=a,l!==null)if(ht(l.value,a)){if(l.children===i.children&&!Ye.current){t=Lt(e,t,n);break e}}else for(l=t.child,l!==null&&(l.return=t);l!==null;){var s=l.dependencies;if(s!==null){a=l.child;for(var c=s.firstContext;c!==null;){if(c.context===r){if(l.tag===1){c=_t(-1,n&-n),c.tag=2;var g=l.updateQueue;if(g!==null){g=g.shared;var S=g.pending;S===null?c.next=c:(c.next=S.next,S.next=c),g.pending=c}}l.lanes|=n,c=l.alternate,c!==null&&(c.lanes|=n),zl(l.return,n,t),s.lanes|=n;break}c=c.next}}else if(l.tag===10)a=l.type===t.type?null:l.child;else if(l.tag===18){if(a=l.return,a===null)throw Error(o(341));a.lanes|=n,s=a.alternate,s!==null&&(s.lanes|=n),zl(a,n,t),a=l.sibling}else a=l.child;if(a!==null)a.return=l;else for(a=l;a!==null;){if(a===t){a=null;break}if(l=a.sibling,l!==null){l.return=a.return,a=l;break}a=a.return}l=a}$e(e,t,i.children,n),t=t.child}return t;case 9:return i=t.type,r=t.pendingProps.children,Dn(t,n),i=ut(i),r=r(i),t.flags|=1,$e(e,t,r,n),t.child;case 14:return r=t.type,i=mt(r,t.pendingProps),i=mt(r.type,i),Xs(e,t,r,i,n);case 15:return Zs(e,t,t.type,t.pendingProps,n);case 17:return r=t.type,i=t.pendingProps,i=t.elementType===r?i:mt(r,i),Ei(e,t),t.tag=1,qe(r)?(e=!0,ri(t)):e=!1,Dn(t,n),Fs(t,r,i),na(t,r,i,n),aa(null,t,r,!0,e,n);case 19:return au(e,t,n);case 22:return Js(e,t,n)}throw Error(o(156,t.tag))};function Ou(e,t){return so(e,t)}function Hp(e,t,n,r){this.tag=e,this.key=n,this.sibling=this.child=this.return=this.stateNode=this.type=this.elementType=null,this.index=0,this.ref=null,this.pendingProps=t,this.dependencies=this.memoizedState=this.updateQueue=this.memoizedProps=null,this.mode=r,this.subtreeFlags=this.flags=0,this.deletions=null,this.childLanes=this.lanes=0,this.alternate=null}function dt(e,t,n,r){return new Hp(e,t,n,r)}function Ta(e){return e=e.prototype,!(!e||!e.isReactComponent)}function $p(e){if(typeof e=="function")return Ta(e)?1:0;if(e!=null){if(e=e.$$typeof,e===be)return 11;if(e===Ve)return 14}return 2}function en(e,t){var n=e.alternate;return n===null?(n=dt(e.tag,t,e.key,e.mode),n.elementType=e.elementType,n.type=e.type,n.stateNode=e.stateNode,n.alternate=e,e.alternate=n):(n.pendingProps=t,n.type=e.type,n.flags=0,n.subtreeFlags=0,n.deletions=null),n.flags=e.flags&14680064,n.childLanes=e.childLanes,n.lanes=e.lanes,n.child=e.child,n.memoizedProps=e.memoizedProps,n.memoizedState=e.memoizedState,n.updateQueue=e.updateQueue,t=e.dependencies,n.dependencies=t===null?null:{lanes:t.lanes,firstContext:t.firstContext},n.sibling=e.sibling,n.index=e.index,n.ref=e.ref,n}function _i(e,t,n,r,i,l){var a=2;if(r=e,typeof e=="function")Ta(e)&&(a=1);else if(typeof e=="string")a=5;else e:switch(e){case Ae:return gn(n.children,i,l,t);case A:a=8,i|=8;break;case ie:return e=dt(12,n,t,i|2),e.elementType=ie,e.lanes=l,e;case ue:return e=dt(13,n,t,i),e.elementType=ue,e.lanes=l,e;case Oe:return e=dt(19,n,t,i),e.elementType=Oe,e.lanes=l,e;case xe:return Li(n,i,l,t);default:if(typeof e=="object"&&e!==null)switch(e.$$typeof){case te:a=10;break e;case ne:a=9;break e;case be:a=11;break e;case Ve:a=14;break e;case je:a=16,r=null;break e}throw Error(o(130,e==null?e:typeof e,""))}return t=dt(a,n,t,i),t.elementType=e,t.type=r,t.lanes=l,t}function gn(e,t,n,r){return e=dt(7,e,r,t),e.lanes=n,e}function Li(e,t,n,r){return e=dt(22,e,r,t),e.elementType=xe,e.lanes=n,e.stateNode={isHidden:!1},e}function ba(e,t,n){return e=dt(6,e,null,t),e.lanes=n,e}function Na(e,t,n){return t=dt(4,e.children!==null?e.children:[],e.key,t),t.lanes=n,t.stateNode={containerInfo:e.containerInfo,pendingChildren:null,implementation:e.implementation},t}function Kp(e,t,n,r,i){this.tag=t,this.containerInfo=e,this.finishedWork=this.pingCache=this.current=this.pendingChildren=null,this.timeoutHandle=-1,this.callbackNode=this.pendingContext=this.context=null,this.callbackPriority=0,this.eventTimes=tl(0),this.expirationTimes=tl(-1),this.entangledLanes=this.finishedLanes=this.mutableReadLanes=this.expiredLanes=this.pingedLanes=this.suspendedLanes=this.pendingLanes=0,this.entanglements=tl(0),this.identifierPrefix=r,this.onRecoverableError=i,this.mutableSourceEagerHydrationData=null}function Aa(e,t,n,r,i,l,a,s,c){return e=new Kp(e,t,n,s,c),t===1?(t=1,l===!0&&(t|=8)):t=0,l=dt(3,null,null,t),e.current=l,l.stateNode=e,l.memoizedState={element:r,isDehydrated:n,cache:null,transitions:null,pendingSuspenseBoundaries:null},Gl(l),e}function Vp(e,t,n){var r=3<arguments.length&&arguments[3]!==void 0?arguments[3]:null;return{$$typeof:Ce,key:r==null?null:""+r,children:e,containerInfo:t,implementation:n}}function Iu(e){if(!e)return $t;e=e._reactInternals;e:{if(nn(e)!==e||e.tag!==1)throw Error(o(170));var t=e;do{switch(t.tag){case 3:t=t.stateNode.context;break e;case 1:if(qe(t.type)){t=t.stateNode.__reactInternalMemoizedMergedChildContext;break e}}t=t.return}while(t!==null);throw Error(o(171))}if(e.tag===1){var n=e.type;if(qe(n))return ls(e,n,t)}return t}function _u(e,t,n,r,i,l,a,s,c){return e=Aa(n,r,!0,e,i,l,a,s,c),e.context=Iu(null),n=e.current,r=Ke(),i=Zt(n),l=_t(r,i),l.callback=t??null,Yt(n,l,i),e.current.lanes=i,Qn(e,i,r),Ze(e,r),e}function Bi(e,t,n,r){var i=t.current,l=Ke(),a=Zt(i);return n=Iu(n),t.context===null?t.context=n:t.pendingContext=n,t=_t(l,a),t.payload={element:e},r=r===void 0?null:r,r!==null&&(t.callback=r),e=Yt(i,t,a),e!==null&&(xt(e,i,a,l),pi(e,i,a)),a}function Di(e){if(e=e.current,!e.child)return null;switch(e.child.tag){case 5:return e.child.stateNode;default:return e.child.stateNode}}function Lu(e,t){if(e=e.memoizedState,e!==null&&e.dehydrated!==null){var n=e.retryLane;e.retryLane=n!==0&&n<t?n:t}}function Oa(e,t){Lu(e,t),(e=e.alternate)&&Lu(e,t)}function Yp(){return null}var Bu=typeof reportError=="function"?reportError:function(e){console.error(e)};function Ia(e){this._internalRoot=e}Pi.prototype.render=Ia.prototype.render=function(e){var t=this._internalRoot;if(t===null)throw Error(o(409));Bi(e,t,null,null)},Pi.prototype.unmount=Ia.prototype.unmount=function(){var e=this._internalRoot;if(e!==null){this._internalRoot=null;var t=e.containerInfo;dn(function(){Bi(null,e,null,null)}),t[bt]=null}};function Pi(e){this._internalRoot=e}Pi.prototype.unstable_scheduleHydration=function(e){if(e){var t=yo();e={blockedOn:null,target:e,priority:t};for(var n=0;n<zt.length&&t!==0&&t<zt[n].priority;n++);zt.splice(n,0,e),n===0&&wo(e)}};function _a(e){return!(!e||e.nodeType!==1&&e.nodeType!==9&&e.nodeType!==11)}function Mi(e){return!(!e||e.nodeType!==1&&e.nodeType!==9&&e.nodeType!==11&&(e.nodeType!==8||e.nodeValue!==" react-mount-point-unstable "))}function Du(){}function qp(e,t,n,r,i){if(i){if(typeof r=="function"){var l=r;r=function(){var g=Di(a);l.call(g)}}var a=_u(t,r,e,0,null,!1,!1,"",Du);return e._reactRootContainer=a,e[bt]=a.current,cr(e.nodeType===8?e.parentNode:e),dn(),a}for(;i=e.lastChild;)e.removeChild(i);if(typeof r=="function"){var s=r;r=function(){var g=Di(c);s.call(g)}}var c=Aa(e,0,!1,null,null,!1,!1,"",Du);return e._reactRootContainer=c,e[bt]=c.current,cr(e.nodeType===8?e.parentNode:e),dn(function(){Bi(t,c,n,r)}),c}function Wi(e,t,n,r,i){var l=n._reactRootContainer;if(l){var a=l;if(typeof i=="function"){var s=i;i=function(){var c=Di(a);s.call(c)}}Bi(t,a,e,i)}else a=qp(n,t,e,i,r);return Di(a)}go=function(e){switch(e.tag){case 3:var t=e.stateNode;if(t.current.memoizedState.isDehydrated){var n=qn(t.pendingLanes);n!==0&&(nl(t,n|1),Ze(t,Re()),(ae&6)===0&&(zn=Re()+500,Kt()))}break;case 13:dn(function(){var r=It(e,1);if(r!==null){var i=Ke();xt(r,e,1,i)}}),Oa(e,1)}},rl=function(e){if(e.tag===13){var t=It(e,134217728);if(t!==null){var n=Ke();xt(t,e,134217728,n)}Oa(e,134217728)}},mo=function(e){if(e.tag===13){var t=Zt(e),n=It(e,t);if(n!==null){var r=Ke();xt(n,e,t,r)}Oa(e,t)}},yo=function(){return de},vo=function(e,t){var n=de;try{return de=e,t()}finally{de=n}},qi=function(e,t,n){switch(t){case"input":if(Gn(e,n),t=n.name,n.type==="radio"&&t!=null){for(n=e;n.parentNode;)n=n.parentNode;for(n=n.querySelectorAll("input[name="+JSON.stringify(""+t)+'][type="radio"]'),t=0;t<n.length;t++){var r=n[t];if(r!==e&&r.form===e.form){var i=ti(r);if(!i)throw Error(o(90));at(r),Gn(r,i)}}}break;case"textarea":Ka(e,n);break;case"select":t=n.value,t!=null&&yn(e,!!n.multiple,t,!1)}},to=ka,no=dn;var Qp={usingClientEntryPoint:!1,Events:[fr,bn,ti,Ja,eo,ka]},br={findFiberByHostInstance:rn,bundleType:0,version:"18.3.1",rendererPackageName:"react-dom"},Xp={bundleType:br.bundleType,version:br.version,rendererPackageName:br.rendererPackageName,rendererConfig:br.rendererConfig,overrideHookState:null,overrideHookStateDeletePath:null,overrideHookStateRenamePath:null,overrideProps:null,overridePropsDeletePath:null,overridePropsRenamePath:null,setErrorHandler:null,setSuspenseHandler:null,scheduleUpdate:null,currentDispatcherRef:oe.ReactCurrentDispatcher,findHostInstanceByFiber:function(e){return e=ao(e),e===null?null:e.stateNode},findFiberByHostInstance:br.findFiberByHostInstance||Yp,findHostInstancesForRefresh:null,scheduleRefresh:null,scheduleRoot:null,setRefreshHandler:null,getCurrentFiber:null,reconcilerVersion:"18.3.1-next-f1338f8080-20240426"};if(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__<"u"){var ji=__REACT_DEVTOOLS_GLOBAL_HOOK__;if(!ji.isDisabled&&ji.supportsFiber)try{Pr=ji.inject(Xp),Et=ji}catch{}}return Je.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED=Qp,Je.createPortal=function(e,t){var n=2<arguments.length&&arguments[2]!==void 0?arguments[2]:null;if(!_a(t))throw Error(o(200));return Vp(e,t,null,n)},Je.createRoot=function(e,t){if(!_a(e))throw Error(o(299));var n=!1,r="",i=Bu;return t!=null&&(t.unstable_strictMode===!0&&(n=!0),t.identifierPrefix!==void 0&&(r=t.identifierPrefix),t.onRecoverableError!==void 0&&(i=t.onRecoverableError)),t=Aa(e,1,!1,null,null,n,!1,r,i),e[bt]=t.current,cr(e.nodeType===8?e.parentNode:e),new Ia(t)},Je.findDOMNode=function(e){if(e==null)return null;if(e.nodeType===1)return e;var t=e._reactInternals;if(t===void 0)throw typeof e.render=="function"?Error(o(188)):(e=Object.keys(e).join(","),Error(o(268,e)));return e=ao(t),e=e===null?null:e.stateNode,e},Je.flushSync=function(e){return dn(e)},Je.hydrate=function(e,t,n){if(!Mi(t))throw Error(o(200));return Wi(null,e,t,!0,n)},Je.hydrateRoot=function(e,t,n){if(!_a(e))throw Error(o(405));var r=n!=null&&n.hydratedSources||null,i=!1,l="",a=Bu;if(n!=null&&(n.unstable_strictMode===!0&&(i=!0),n.identifierPrefix!==void 0&&(l=n.identifierPrefix),n.onRecoverableError!==void 0&&(a=n.onRecoverableError)),t=_u(t,null,e,1,n??null,i,!1,l,a),e[bt]=t.current,cr(e),r)for(e=0;e<r.length;e++)n=r[e],i=n._getVersion,i=i(n._source),t.mutableSourceEagerHydrationData==null?t.mutableSourceEagerHydrationData=[n,i]:t.mutableSourceEagerHydrationData.push(n,i);return new Pi(t)},Je.render=function(e,t,n){if(!Mi(t))throw Error(o(200));return Wi(null,e,t,!1,n)},Je.unmountComponentAtNode=function(e){if(!Mi(e))throw Error(o(40));return e._reactRootContainer?(dn(function(){Wi(null,null,e,!1,function(){e._reactRootContainer=null,e[bt]=null})}),!0):!1},Je.unstable_batchedUpdates=ka,Je.unstable_renderSubtreeIntoContainer=function(e,t,n,r){if(!Mi(n))throw Error(o(200));if(e==null||e._reactInternals===void 0)throw Error(o(38));return Wi(e,t,n,!1,r)},Je.version="18.3.1-next-f1338f8080-20240426",Je}var Fu;function ad(){if(Fu)return Da.exports;Fu=1;function m(){if(!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__>"u"||typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE!="function"))try{__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(m)}catch(y){console.error(y)}}return m(),Da.exports=ld(),Da.exports}var Hu;function od(){if(Hu)return zi;Hu=1;var m=ad();return zi.createRoot=m.createRoot,zi.hydrateRoot=m.hydrateRoot,zi}var sd=od();const ud=qu(sd);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const cd=m=>m.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase(),Qu=(...m)=>m.filter((y,o,x)=>!!y&&y.trim()!==""&&x.indexOf(y)===o).join(" ").trim();/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var pd={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const dd=q.forwardRef(({color:m="currentColor",size:y=24,strokeWidth:o=2,absoluteStrokeWidth:x,className:v="",children:b,iconNode:I,...z},N)=>q.createElement("svg",{ref:N,...pd,width:y,height:y,stroke:m,strokeWidth:x?Number(o)*24/Number(y):o,className:Qu("lucide",v),...z},[...I.map(([H,U])=>q.createElement(H,U)),...Array.isArray(b)?b:[b]]));/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const fe=(m,y)=>{const o=q.forwardRef(({className:x,...v},b)=>q.createElement(dd,{ref:b,iconNode:y,className:Qu(`lucide-${cd(m)}`,x),...v}));return o.displayName=`${m}`,o};/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const fd=[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]],Ga=fe("Check",fd);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const hd=[["path",{d:"m18 16 4-4-4-4",key:"1inbqp"}],["path",{d:"m6 8-4 4 4 4",key:"15zrgr"}],["path",{d:"m14.5 4-5 16",key:"e7oirm"}]],gd=fe("CodeXml",hd);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const md=[["rect",{width:"14",height:"14",x:"8",y:"8",rx:"2",ry:"2",key:"17jyea"}],["path",{d:"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",key:"zix9uf"}]],Fa=fe("Copy",md);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const yd=[["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",key:"ih7n3h"}],["polyline",{points:"7 10 12 15 17 10",key:"2ggqvy"}],["line",{x1:"12",x2:"12",y1:"15",y2:"3",key:"1vk2je"}]],Xu=fe("Download",yd);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const vd=[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",key:"1rqfz7"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}],["path",{d:"M10 9H8",key:"b1mrlr"}],["path",{d:"M16 13H8",key:"t4e002"}],["path",{d:"M16 17H8",key:"z1uh3a"}]],xd=fe("FileText",vd);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const wd=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",ry:"2",key:"1m3agn"}],["circle",{cx:"9",cy:"9",r:"2",key:"af1f0g"}],["path",{d:"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21",key:"1xmnt7"}]],Zu=fe("Image",wd);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ed=[["path",{d:"M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16",key:"tarvll"}]],Sd=fe("Laptop",Ed);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const kd=[["path",{d:"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z",key:"zw3jo"}],["path",{d:"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12",key:"1wduqc"}],["path",{d:"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17",key:"kqbvx6"}]],ja=fe("Layers",kd);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Cd=[["path",{d:"M21 12a9 9 0 1 1-6.219-8.56",key:"13zald"}]],Rd=fe("LoaderCircle",Cd);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Td=[["polyline",{points:"15 3 21 3 21 9",key:"mznyad"}],["polyline",{points:"9 21 3 21 3 15",key:"1avn1i"}],["line",{x1:"21",x2:"14",y1:"3",y2:"10",key:"ota7mn"}],["line",{x1:"3",x2:"10",y1:"21",y2:"14",key:"1atl0r"}]],Ju=fe("Maximize2",Td);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const bd=[["path",{d:"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",key:"1lielz"}]],Nd=fe("MessageSquare",bd);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ad=[["polyline",{points:"4 14 10 14 10 20",key:"11kfnr"}],["polyline",{points:"20 10 14 10 14 4",key:"rlmsce"}],["line",{x1:"14",x2:"21",y1:"10",y2:"3",key:"o5lafz"}],["line",{x1:"3",x2:"10",y1:"21",y2:"14",key:"1atl0r"}]],Od=fe("Minimize2",Ad);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Id=[["rect",{width:"20",height:"14",x:"2",y:"3",rx:"2",key:"48i651"}],["line",{x1:"8",x2:"16",y1:"21",y2:"21",key:"1svkeh"}],["line",{x1:"12",x2:"12",y1:"17",y2:"21",key:"vw1qmm"}]],_d=fe("Monitor",Id);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ld=[["path",{d:"M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z",key:"a7tn18"}]],Bd=fe("Moon",Ld);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Dd=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M9 3v18",key:"fh3hqa"}],["path",{d:"m16 15-3-3 3-3",key:"14y99z"}]],Pd=fe("PanelLeftClose",Dd);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Md=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M9 3v18",key:"fh3hqa"}],["path",{d:"m14 9 3 3-3 3",key:"8010ee"}]],Wd=fe("PanelLeftOpen",Md);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const jd=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M15 3v18",key:"14nvp0"}]],zd=fe("PanelRight",jd);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ud=[["path",{d:"M13.234 20.252 21 12.3",key:"1cbrk9"}],["path",{d:"m16 6-8.414 8.586a2 2 0 0 0 0 2.828 2 2 0 0 0 2.828 0l8.414-8.586a4 4 0 0 0 0-5.656 4 4 0 0 0-5.656 0l-8.415 8.585a6 6 0 1 0 8.486 8.486",key:"1pkts6"}]],Gd=fe("Paperclip",Ud);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Fd=[["path",{d:"M5 12h14",key:"1ays0h"}],["path",{d:"M12 5v14",key:"s699le"}]],Hd=fe("Plus",Fd);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const $d=[["path",{d:"M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8",key:"1p45f6"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}]],Kd=fe("RotateCw",$d);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Vd=[["path",{d:"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z",key:"1ffxy3"}],["path",{d:"m21.854 2.147-10.94 10.939",key:"12cjpa"}]],ec=fe("Send",Vd);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Yd=[["path",{d:"M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",key:"1qme2f"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]],tc=fe("Settings",Yd);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const qd=[["rect",{width:"14",height:"20",x:"5",y:"2",rx:"2",ry:"2",key:"1yt0o3"}],["path",{d:"M12 18h.01",key:"mhygvu"}]],Qd=fe("Smartphone",qd);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Xd=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}]],Zd=fe("Square",Xd);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Jd=[["circle",{cx:"12",cy:"12",r:"4",key:"4exip2"}],["path",{d:"M12 2v2",key:"tus03m"}],["path",{d:"M12 20v2",key:"1lh1kg"}],["path",{d:"m4.93 4.93 1.41 1.41",key:"149t6j"}],["path",{d:"m17.66 17.66 1.41 1.41",key:"ptbguv"}],["path",{d:"M2 12h2",key:"1t8f8n"}],["path",{d:"M20 12h2",key:"1q8mjw"}],["path",{d:"m6.34 17.66-1.41 1.41",key:"1m8zz5"}],["path",{d:"m19.07 4.93-1.41 1.41",key:"1shlcs"}]],e6=fe("Sun",Jd);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const t6=[["rect",{width:"16",height:"20",x:"4",y:"2",rx:"2",ry:"2",key:"76otgf"}],["line",{x1:"12",x2:"12.01",y1:"18",y2:"18",key:"1dp563"}]],n6=fe("Tablet",t6);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const r6=[["path",{d:"M3 6h18",key:"d0wm0j"}],["path",{d:"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6",key:"4alrt4"}],["path",{d:"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2",key:"v07s0e"}],["line",{x1:"10",x2:"10",y1:"11",y2:"17",key:"1uufr5"}],["line",{x1:"14",x2:"14",y1:"11",y2:"17",key:"xtxkd"}]],Ui=fe("Trash2",r6);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const i6=[["path",{d:"m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72",key:"ul74o6"}],["path",{d:"m14 7 3 3",key:"1r5n42"}],["path",{d:"M5 6v4",key:"ilb8ba"}],["path",{d:"M19 14v4",key:"blhpug"}],["path",{d:"M10 2v2",key:"7u0qdc"}],["path",{d:"M7 8H3",key:"zfb6yr"}],["path",{d:"M21 16h-4",key:"1cnmox"}],["path",{d:"M11 3H9",key:"1obp7u"}]],l6=fe("WandSparkles",i6);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const a6=[["path",{d:"M18 6 6 18",key:"1bl5f8"}],["path",{d:"m6 6 12 12",key:"d8bk6v"}]],Gi=fe("X",a6);function o6({isOpen:m,sessions:y,activeSessionId:o,onSelectSession:x,onNewChat:v,onDeleteSession:b,onOpenSettings:I,onOpenImageShowcase:z,activeView:N,theme:H,onToggleTheme:U,onCloseSidebar:T}){return u.jsxs("aside",{className:`sidebar icon-only ${m?"":"collapsed"}`,"aria-hidden":!m,children:[u.jsx("div",{className:"sidebar-header icon-only-header",children:u.jsxs("button",{className:"brand-icon-toggle",onClick:T,title:"Collapse Sidebar",children:[u.jsx(ja,{size:14,strokeWidth:1.5,className:"brand-logo-default"}),u.jsx(Pd,{size:14,strokeWidth:1.5,className:"brand-logo-hover"})]})}),u.jsx("div",{className:"sidebar-action-box",children:u.jsx("button",{className:"new-chat-btn icon-only-btn",onClick:v,title:"New Chat Session",children:u.jsx(Hd,{size:15,strokeWidth:1.5})})}),u.jsx("div",{className:"sidebar-tools-section",children:u.jsx("button",{className:`image-creator-btn icon-only-btn ${N==="image-studio"?"active":""}`,onClick:z,title:"COREZ STUDIO",children:u.jsx(Zu,{size:14,strokeWidth:1.5})})}),u.jsx("div",{className:"chat-history-list icon-only-list",children:y.map(L=>u.jsxs("div",{className:`history-item icon-only-item ${N==="chat"&&L.id===o?"active":""}`,onClick:()=>x(L.id),title:L.title,children:[u.jsx(Nd,{size:14,strokeWidth:1.5}),u.jsx("button",{className:"delete-chat-btn icon-only-delete",onClick:$=>{$.stopPropagation(),b(L.id)},title:`Delete ${L.title}`,children:u.jsx(Ui,{size:10,strokeWidth:1.5})})]},L.id))}),u.jsxs("div",{className:"sidebar-footer icon-only-footer",children:[u.jsx("button",{className:"footer-action-btn icon-only-btn",onClick:U,title:H==="dark"?"Switch to Light Mode":"Switch to Dark Mode",children:H==="dark"?u.jsx(e6,{size:14,strokeWidth:1.5}):u.jsx(Bd,{size:14,strokeWidth:1.5})}),u.jsx("button",{className:"footer-action-btn icon-only-btn",onClick:I,title:"Corez Settings",children:u.jsx(tc,{size:14,strokeWidth:1.5})})]})]})}function s6({sidebarOpen:m,onToggleSidebar:y,canvasOpen:o,onToggleCanvas:x,hasExecutableCode:v}){return u.jsxs("header",{className:"top-header",children:[u.jsx("div",{className:"header-left",children:!m&&u.jsx("button",{className:"icon-btn",onClick:y,title:"Open Sidebar",children:u.jsx(Wd,{size:16,strokeWidth:1.5})})}),u.jsx("div",{className:"header-right",children:u.jsxs("button",{className:"canvas-toggle-btn",onClick:x,title:"Toggle Preview Split-View",style:v?{border:"1px solid var(--text-primary)",background:"var(--bg-tertiary)"}:{},children:[u.jsx(zd,{size:15,strokeWidth:1.5}),u.jsx("span",{children:o?"Hide Preview":"Preview"}),v&&u.jsx("span",{style:{width:"5px",height:"5px",borderRadius:"99px",backgroundColor:"var(--text-primary)"}})]})})]})}function u6({code:m,lang:y}){const[o,x]=q.useState(!1),v=()=>{navigator.clipboard&&(navigator.clipboard.writeText(m),x(!0),setTimeout(()=>x(!1),2e3))};return u.jsxs("div",{className:"code-block-container",children:[u.jsxs("div",{className:"code-header",children:[u.jsx("span",{className:"code-lang",children:y||"code"}),u.jsxs("button",{className:"code-btn",onClick:v,title:"Copy code",children:[o?u.jsx(Ga,{size:12,strokeWidth:1.5}):u.jsx(Fa,{size:12,strokeWidth:1.5}),u.jsx("span",{children:o?"Copied":"Copy"})]})]}),u.jsx("pre",{className:"code-content",children:u.jsx("code",{children:m})})]})}function c6({message:m,onRunInCanvas:y,onReviseCode:o}){const x=m.role==="user",v=N=>{if(!N)return null;const H=/(!?\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;return N.split(H).map((T,L)=>{if(!T)return null;const $=T.match(/^!\[(.*?)\]\((.*?)\)$/);if($)return u.jsx("span",{className:"markdown-inline-img-wrapper",children:u.jsx("img",{src:$[2],alt:$[1],className:"markdown-inline-img"})},L);const P=T.match(/^\[(.*?)\]\((.*?)\)$/);return P?u.jsx("a",{href:P[2],target:"_blank",rel:"noopener noreferrer",className:"markdown-link",children:P[1]},L):T.startsWith("`")&&T.endsWith("`")&&T.length>2?u.jsx("code",{className:"inline-code",children:T.slice(1,-1)},L):T.startsWith("**")&&T.endsWith("**")&&T.length>4?u.jsx("strong",{children:T.slice(2,-2)},L):T.startsWith("*")&&T.endsWith("*")&&T.length>2?u.jsx("em",{children:T.slice(1,-1)},L):T})},b=N=>{if(N.length<2)return null;const H=L=>L.trim().replace(/^\||\|$/g,"").split("|").map(P=>P.trim()),U=H(N[0]),T=N.slice(2).map(H);return{headers:U,bodyRows:T}},I=N=>{const H=N.split(`
`),U=[];let T=0;for(;T<H.length;){const L=H[T],$=L.trim();if($.startsWith("|")&&T+1<H.length&&/^\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?$/.test(H[T+1].trim())){const W=[H[T],H[T+1]];for(T+=2;T<H.length&&H[T].trim().startsWith("|");)W.push(H[T]),T++;const Q=b(W);if(Q){U.push(u.jsx("div",{className:"markdown-table-wrapper",children:u.jsxs("table",{className:"markdown-table",children:[u.jsx("thead",{children:u.jsx("tr",{children:Q.headers.map((he,ce)=>u.jsx("th",{children:v(he)},ce))})}),u.jsx("tbody",{children:Q.bodyRows.map((he,ce)=>u.jsx("tr",{children:he.map((me,oe)=>u.jsx("td",{children:v(me)},oe))},ce))})]})},`table-${T}`));continue}}if(!$){U.push(u.jsx("div",{style:{height:"0.35rem"}},`blank-${T}`)),T++;continue}const P=$.match(/^!\[(.*?)\]\((.*?)\)$/);if(P){U.push(u.jsxs("div",{className:"markdown-image-wrapper",children:[u.jsx("img",{src:P[2],alt:P[1],className:"markdown-image"}),P[1]&&u.jsx("span",{className:"markdown-image-caption",children:P[1]})]},`img-${T}`)),T++;continue}if($.startsWith("# ")||$.startsWith("## ")||$.startsWith("### ")){const W=$.replace(/^#+\s*/,"");U.push(u.jsx("h3",{className:"markdown-heading",children:v(W)},`h-${T}`)),T++;continue}if($.startsWith("> ")){const W=$.slice(2);U.push(u.jsx("blockquote",{className:"markdown-blockquote",children:v(W)},`q-${T}`)),T++;continue}if($.startsWith("- ")||$.startsWith("* ")||/^\d+\.\s/.test($)){const W=$.replace(/^[-*]\s+|\d+\.\s+/,"");U.push(u.jsx("li",{className:"markdown-list-item",children:v(W)},`li-${T}`)),T++;continue}U.push(u.jsx("p",{children:v(L)},`p-${T}`)),T++}return U},z=N=>{if(!N)return null;const H=/```(\w+)?\s*([\s\S]*?)```/g,U=[];let T=0,L,$=0;for(;(L=H.exec(N))!==null;){L.index>T&&U.push({type:"text",content:N.slice(T,L.index)});const P=L[1]||"code",W=L[2].trim(),Q=P.toLowerCase()==="html"||P.toLowerCase()==="xml"||W.includes("<html")||W.includes("<div")||W.includes("<script");U.push({type:"code",lang:P,code:W,isExecutable:Q,index:$++}),T=L.index+L[0].length}return T<N.length&&U.push({type:"text",content:N.slice(T)}),U.map((P,W)=>P.type==="code"?P.isExecutable&&!x?u.jsxs("div",{style:{margin:"0.65rem 0",display:"flex",gap:"0.5rem"},children:[u.jsxs("div",{className:"preview-action",style:{flex:1,display:"flex",justifyContent:"center"},onClick:()=>y(P.code),title:"Click to open app live on the right side",children:[u.jsx(ja,{size:14,strokeWidth:1.5,style:{color:"var(--text-primary)"}}),u.jsx("span",{children:"Open preview"})]}),u.jsxs("div",{className:"preview-action",style:{flex:1,display:"flex",justifyContent:"center",backgroundColor:"var(--bg-tertiary)"},onClick:()=>{o&&o(P.code)},title:"Ask AI to modify this code",children:[u.jsx(l6,{size:14,strokeWidth:1.5,style:{color:"var(--text-primary)"}}),u.jsx("span",{children:"Revise"})]})]},W):x?u.jsxs("div",{style:{margin:"0.4rem 0",padding:"0.4rem 0.65rem",backgroundColor:"rgba(0,0,0,0.15)",border:"1px solid var(--border-color)",borderRadius:"var(--radius-sm)",display:"inline-flex",alignItems:"center",gap:"0.4rem",color:"var(--text-secondary)",fontSize:"0.75rem"},children:[u.jsx(ja,{size:14,strokeWidth:1.5}),u.jsxs("span",{children:["Attached code block (",P.code.split(`
`).length," lines)"]})]},W):u.jsx(u6,{code:P.code,lang:P.lang},W):u.jsx("div",{className:"markdown-body",children:I(P.content)},W))};return u.jsx("div",{className:`message-wrapper ${x?"user":"ai"}`,children:u.jsx("div",{className:"message-body",children:u.jsx("div",{className:"message-content",children:z(m.content)})})})}function p6({input:m,setInput:y,onSendMessage:o,onStopMessage:x,isStreaming:v,textareaRef:b}){const I=q.useRef(null),z=b||I;q.useEffect(()=>{z.current&&(z.current.style.height="auto",z.current.style.height=`${Math.min(z.current.scrollHeight,140)}px`)},[m]);const N=U=>{if(U==null||U.preventDefault(),v){x&&x();return}m.trim()&&(o(m.trim()),y(""),z.current&&(z.current.style.height="auto"))},H=U=>{U.key==="Enter"&&!U.shiftKey&&(U.preventDefault(),N())};return u.jsx("div",{className:"chat-input-container",children:u.jsxs("form",{onSubmit:N,className:"input-box",children:[u.jsx("textarea",{ref:z,className:"chat-textarea",value:m,onChange:U=>y(U.target.value),onKeyDown:H,placeholder:v?"Corez is generating...":"Ask Corez...",rows:1}),u.jsx("div",{className:"input-actions-bar",children:v?u.jsx("button",{type:"button",className:"send-btn stop-btn",onClick:x,title:"Stop Generation",children:u.jsx(Zd,{size:13,fill:"currentColor",strokeWidth:1.5})}):u.jsx("button",{type:"submit",className:"send-btn",disabled:!m.trim(),title:"Send Message",children:u.jsx(ec,{size:15,strokeWidth:1.5})})})]})})}function d6({code:m,onClose:y,isFullScreen:o,onToggleFullScreen:x}){const[v,b]=q.useState("preview"),[I,z]=q.useState("desktop"),[N,H]=q.useState(m||""),[U,T]=q.useState(!1),[L,$]=q.useState(0);q.useEffect(()=>{H(m||""),$(ce=>ce+1)},[m]);const P=()=>{navigator.clipboard.writeText(N),T(!0),setTimeout(()=>T(!1),2e3)},W=()=>{const ce=new Blob([N],{type:"text/html"}),me=URL.createObjectURL(ce),oe=document.createElement("a");oe.href=me,oe.download="corez-app.html",document.body.appendChild(oe),oe.click(),document.body.removeChild(oe),URL.revokeObjectURL(me)},Q=()=>{$(ce=>ce+1)},he={desktop:{label:"Desktop",width:"100%",res:"Fluid / 1920px"},laptop:{label:"Laptop",width:"1100px",res:"1366 × 768"},tablet:{label:"Tablet",width:"768px",res:"768 × 1024"},mobile:{label:"Mobile",width:"375px",res:"375 × 812"}};return u.jsxs("div",{className:`canvas-pane ${o?"full-width":""}`,children:[u.jsxs("div",{className:"canvas-header",children:[u.jsxs("div",{className:"canvas-title",children:[u.jsx("span",{children:"Preview"}),u.jsxs("div",{style:{display:"flex",background:"var(--bg-tertiary)",padding:"2px",borderRadius:"var(--radius-pill)",marginLeft:"0.5rem",border:"1px solid var(--border-color)"},children:[u.jsx("button",{onClick:()=>b("preview"),style:{padding:"3px 10px",borderRadius:"var(--radius-pill)",border:"none",background:v==="preview"?"var(--text-primary)":"transparent",color:v==="preview"?"var(--bg-primary)":"var(--text-secondary)",fontSize:"0.725rem",fontWeight:300,cursor:"pointer",transition:"var(--transition-fast)"},children:"Preview"}),u.jsx("button",{onClick:()=>b("code"),style:{padding:"3px 10px",borderRadius:"var(--radius-pill)",border:"none",background:v==="code"?"var(--text-primary)":"transparent",color:v==="code"?"var(--bg-primary)":"var(--text-secondary)",fontSize:"0.725rem",fontWeight:300,cursor:"pointer",transition:"var(--transition-fast)"},children:"Source"})]})]}),v==="preview"&&u.jsxs("div",{className:"device-mode-bar",children:[u.jsx("button",{onClick:()=>z("desktop"),title:"Desktop Screen View",className:`device-btn ${I==="desktop"?"active":""}`,children:u.jsx(_d,{size:15,strokeWidth:1.5})}),u.jsx("button",{onClick:()=>z("laptop"),title:"Laptop View (1366 × 768)",className:`device-btn ${I==="laptop"?"active":""}`,children:u.jsx(Sd,{size:15,strokeWidth:1.5})}),u.jsx("button",{onClick:()=>z("tablet"),title:"Tablet View (768 × 1024)",className:`device-btn ${I==="tablet"?"active":""}`,children:u.jsx(n6,{size:15,strokeWidth:1.5})}),u.jsx("button",{onClick:()=>z("mobile"),title:"Mobile View (375 × 812)",className:`device-btn ${I==="mobile"?"active":""}`,children:u.jsx(Qd,{size:15,strokeWidth:1.5})})]}),u.jsxs("div",{className:"canvas-controls",children:[u.jsx("button",{className:"icon-btn",onClick:Q,title:"Reload Preview",children:u.jsx(Kd,{size:14,strokeWidth:1.5})}),u.jsx("button",{className:"icon-btn",onClick:P,title:"Copy Source Code",children:U?u.jsx(Ga,{size:14,strokeWidth:1.5,style:{color:"#ffffff"}}):u.jsx(Fa,{size:14,strokeWidth:1.5})}),u.jsx("button",{className:"icon-btn",onClick:W,title:"Download .html file",children:u.jsx(Xu,{size:14,strokeWidth:1.5})}),u.jsx("button",{className:"icon-btn",onClick:x,title:"Toggle Fullscreen",children:o?u.jsx(Od,{size:14,strokeWidth:1.5}):u.jsx(Ju,{size:14,strokeWidth:1.5})}),u.jsx("button",{className:"icon-btn",onClick:y,title:"Close Preview",children:u.jsx(Gi,{size:14,strokeWidth:1.5})})]})]}),u.jsx("div",{className:`canvas-body ${I!=="desktop"&&v==="preview"?"device-wrapper":""}`,children:N?v==="preview"?u.jsxs("div",{className:`preview-container device-mode-${I}`,children:[I!=="desktop"&&u.jsxs("div",{className:"device-frame-header",children:[u.jsx("div",{className:"device-camera-dot"}),u.jsxs("span",{className:"device-spec-tag",children:[he[I].label," • ",he[I].res]})]}),u.jsx("iframe",{title:`Live Application Preview (${he[I].label})`,srcDoc:N,className:"preview-iframe",sandbox:"allow-scripts allow-modals allow-forms allow-same-origin",style:I!=="desktop"?{width:"100%",maxWidth:he[I].width,height:"100%",maxHeight:"100%",margin:"0 auto",borderRadius:I==="mobile"?"20px":"12px"}:{}},L)]}):u.jsx("textarea",{className:"canvas-source-editor","aria-label":"Source code editor",value:N,onChange:ce=>H(ce.target.value)}):u.jsxs("div",{className:"canvas-empty-state",children:[u.jsx("div",{className:"canvas-empty-icon",children:u.jsx(gd,{size:22,strokeWidth:1.5})}),u.jsx("h3",{style:{fontSize:"0.95rem"},children:"No Active App Running"}),u.jsxs("p",{style:{maxWidth:"280px",fontSize:"0.8rem"},children:["Ask Corez to build an application or click ",u.jsx("b",{children:'"Run Preview"'})," on any code block."]})]})})]})}function f6({isOpen:m,onClose:y,onClearAllHistory:o}){return m?u.jsx("div",{className:"modal-overlay",onClick:y,children:u.jsxs("div",{className:"modal-card",onClick:x=>x.stopPropagation(),children:[u.jsxs("div",{className:"modal-header",children:[u.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"0.5rem"},children:[u.jsx(tc,{size:18,strokeWidth:1.5}),u.jsx("span",{className:"modal-title",children:"Corez Preferences"})]}),u.jsx("button",{className:"icon-btn",onClick:y,children:u.jsx(Gi,{size:15,strokeWidth:1.5})})]}),u.jsx("div",{style:{fontSize:"0.825rem",color:"var(--text-secondary)",lineHeight:1.5},children:"Corez automatically routes text, code and visual requests through configured hosted AI services with resilient fallbacks. Model selection is managed server-side."}),u.jsx("div",{style:{marginTop:"0.5rem"},children:u.jsxs("button",{className:"footer-action-btn",style:{width:"100%",color:"#ef4444"},onClick:o,children:[u.jsx(Ui,{size:15,strokeWidth:1.5}),u.jsx("span",{children:"Clear Conversation History"})]})})]})}):null}const h6=["app","code-help","explanation","general","writing"],g6=["a","about","addresses","after","am","an","and","announcement","answer","any","api","app","application","arcade","are","article","at","be","between","bi:a_customer","bi:a_landing","bi:a_lot","bi:a_modern","bi:a_prototype","bi:a_quick","bi:a_rough","bi:a_simple","bi:after_a","bi:an_interactive","bi:and_build","bi:and_how","bi:api_response","bi:app_for","bi:app_with","bi:arcade_game","bi:are_some","bi:break_down","bi:build_a","bi:bullet_points","bi:calculator_tool","bi:can_i","bi:can_you","bi:captions_for","bi:code_and","bi:copy_for","bi:create_a","bi:database_indexes","bi:debug_why","bi:design_a","bi:develop_a","bi:diagnose_why","bi:difference_between","bi:do_i","bi:does_my","bi:down_how","bi:draft_a","bi:draft_an","bi:edit_this","bi:email_to","bi:error_in","bi:explain_database","bi:explain_how","bi:explain_the","bi:explain_why","bi:fails_to","bi:fix_this","bi:for_a","bi:for_me","bi:for_my","bi:for_our","bi:for_product","bi:for_this","bi:game_for","bi:generate_a","bi:generator_tool","bi:have_a","bi:help_debug","bi:help_me","bi:how_can","bi:how_do","bi:how_does","bi:how_web","bi:i_am","bi:i_have","bi:i_need","bi:in_javascript","bi:in_my","bi:in_plain","bi:in_simple","bi:in_the","bi:indexes_in","bi:is_my","bi:is_the","bi:is_your","bi:landing_page","bi:launch_email","bi:letter_for","bi:machine_learning","bi:make_a","bi:me_a","bi:me_how","bi:me_the","bi:memory_leak","bi:message_for","bi:my_python","bi:page_for","bi:plain_english","bi:polish_this","bi:portal_with","bi:python_script","bi:remote_work","bi:rest_api","bi:returns_null","bi:review_this","bi:rewrite_this","bi:script_that","bi:server_side","bi:ship_a","bi:side_rendering","bi:simple_terms","bi:some_general","bi:stack_trace","bi:summarize_this","bi:teach_me","bi:tell_me","bi:text_to","bi:thank_you","bi:thanks_a","bi:the_difference","bi:this_broken","bi:this_react","bi:this_technical","bi:to_be","bi:to_sound","bi:to_start","bi:tool_app","bi:web_app","bi:web_application","bi:website_with","bi:what_are","bi:what_is","bi:why_do","bi:why_does","bi:why_is","bi:why_my","bi:why_this","bi:widget_with","bi:with_drag","bi:write_a","bi:write_an","break","broken","browser","bug","build","bullet","business","by","calculator","call","can","canvas","captions","card","clean","code","coffee","color","compare","component","concept","concise","converter","copy","counter","create","css","customer","daily","dashboard","data","database","day","debug","design","develop","diagnose","difference","do","does","down","draft","drag","edit","email","engaging","english","error","errors","event","executive","explain","fail","fails","feedback","file","fix","for","from","function","game","general","generate","generator","git","going","good","graphql","great","have","hello","help","hey","hi","hobbies","hook","how","html","i","ideas","in","index","indexes","interactive","into","invitation","is","it","javascript","js","json","key","landing","launch","leak","learning","letter","list","looking","loop","lot","machine","make","me","memory","message","mobile","modern","more","morning","my","need","nested","new","next","nice","not","null","o","of","office","on","online","our","out","page","plain","please","points","polish","portal","position","post","prepare","preview","product","productivity","professional","project","prototype","public","python","query","quick","react","regex","release","remote","rendering","response","rest","returns","review","rewrite","rough","script","server","servers","ship","short","side","simple","site","so","software","some","sound","sounds","source","sql","stack","start","state","status","step","store","suggestions","summarize","summary","systems","task","teach","technical","tell","terms","text","thank","thanks","that","the","this","thoughts","thread","throwing","time","timer","tips","to","today","tool","trace","two","typescript","u","undefined","unit","up","update","using","versus","web","website","what","when","why","widget","with","work","write","you","your"],m6={app:-1.609437912434,"code-help":-1.609437912434,explanation:-1.609437912434,general:-1.609437912434,writing:-1.609437912434},y6=JSON.parse('{"a":{"app":-3.01972777911,"code-help":-4.662090476241,"explanation":-4.922896379788,"general":-4.066693030892,"writing":-3.568123252978},"about":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-4.855150391256,"writing":-5.870708345972},"addresses":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-6.563855526532},"after":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.465243237864},"am":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.07829394257,"writing":-6.563855526532},"an":{"app":-4.783316371372,"code-help":-5.914853444736,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-4.617945377477},"and":{"app":-4.965637928166,"code-help":-4.816241156068,"explanation":-3.967384934761,"general":-5.07829394257,"writing":-4.617945377477},"announcement":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.465243237864},"answer":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.77144112313,"writing":-5.870708345972},"any":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-6.563855526532},"api":{"app":-6.5750758406,"code-help":-4.998562712862,"explanation":-5.433722003554,"general":-6.46458830369,"writing":-6.563855526532},"app":{"app":-4.010126483138,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"application":{"app":-5.476463551932,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.870708345972},"arcade":{"app":-5.476463551932,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"are":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.146039931102,"general":-4.38514676201,"writing":-6.563855526532},"article":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.465243237864},"at":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-5.77144112313,"writing":-6.563855526532},"be":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.465243237864},"between":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-4.586424143167,"general":-6.46458830369,"writing":-6.563855526532},"bi:a_customer":{"app":-5.88192866004,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.870708345972},"bi:a_landing":{"app":-5.476463551932,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:a_lot":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-6.563855526532},"bi:a_modern":{"app":-5.476463551932,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:a_prototype":{"app":-5.476463551932,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:a_quick":{"app":-5.88192866004,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.870708345972},"bi:a_rough":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-6.563855526532},"bi:a_simple":{"app":-4.965637928166,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:after_a":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.465243237864},"bi:an_interactive":{"app":-5.18878147948,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:and_build":{"app":-5.476463551932,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:and_how":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.146039931102,"general":-6.46458830369,"writing":-6.563855526532},"bi:api_response":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:app_for":{"app":-5.476463551932,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:app_with":{"app":-4.965637928166,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:arcade_game":{"app":-5.476463551932,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:are_some":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-6.563855526532},"bi:break_down":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-4.922896379788,"general":-6.46458830369,"writing":-6.563855526532},"bi:build_a":{"app":-4.49563429892,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:bullet_points":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.465243237864},"bi:calculator_tool":{"app":-5.476463551932,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:can_i":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-6.532334292222,"general":-5.77144112313,"writing":-6.563855526532},"bi:can_you":{"app":-5.88192866004,"code-help":-6.608000625296,"explanation":-5.839187111662,"general":-5.365976015022,"writing":-5.870708345972},"bi:captions_for":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.465243237864},"bi:code_and":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:copy_for":{"app":-5.88192866004,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.177561165412},"bi:create_a":{"app":-4.629165691544,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:database_indexes":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.433722003554,"general":-6.46458830369,"writing":-6.563855526532},"bi:debug_why":{"app":-6.5750758406,"code-help":-5.221706264176,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:design_a":{"app":-4.965637928166,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:develop_a":{"app":-5.18878147948,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:diagnose_why":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:difference_between":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-4.586424143167,"general":-6.46458830369,"writing":-6.563855526532},"bi:do_i":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-6.563855526532},"bi:does_my":{"app":-6.5750758406,"code-help":-4.816241156068,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:down_how":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-4.922896379788,"general":-6.46458830369,"writing":-6.563855526532},"bi:draft_a":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-4.772096057304},"bi:draft_an":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.177561165412},"bi:edit_this":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.465243237864},"bi:email_to":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.465243237864},"bi:error_in":{"app":-6.5750758406,"code-help":-5.221706264176,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:explain_database":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.433722003554,"general":-6.46458830369,"writing":-6.563855526532},"bi:explain_how":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.433722003554,"general":-6.46458830369,"writing":-6.563855526532},"bi:explain_the":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.433722003554,"general":-6.46458830369,"writing":-6.563855526532},"bi:explain_why":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-5.870708345972},"bi:fails_to":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:fix_this":{"app":-6.5750758406,"code-help":-5.221706264176,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:for_a":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.77144112313,"writing":-4.484413984852},"bi:for_me":{"app":-5.88192866004,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.77144112313,"writing":-6.563855526532},"bi:for_my":{"app":-4.629165691544,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.77144112313,"writing":-5.870708345972},"bi:for_our":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.177561165412},"bi:for_product":{"app":-5.88192866004,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.870708345972},"bi:for_this":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:game_for":{"app":-5.476463551932,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:generate_a":{"app":-4.965637928166,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:generator_tool":{"app":-5.476463551932,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:have_a":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-4.855150391256,"writing":-6.563855526532},"bi:help_debug":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:help_me":{"app":-6.5750758406,"code-help":-5.221706264176,"explanation":-6.532334292222,"general":-5.77144112313,"writing":-5.870708345972},"bi:how_can":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-6.532334292222,"general":-5.77144112313,"writing":-6.563855526532},"bi:how_do":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-5.146039931102,"general":-5.365976015022,"writing":-6.563855526532},"bi:how_does":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-4.740574822994,"general":-6.46458830369,"writing":-6.563855526532},"bi:how_web":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.433722003554,"general":-6.46458830369,"writing":-6.563855526532},"bi:i_am":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.07829394257,"writing":-6.563855526532},"bi:i_have":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.07829394257,"writing":-6.563855526532},"bi:i_need":{"app":-5.88192866004,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.77144112313,"writing":-6.563855526532},"bi:in_javascript":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-5.433722003554,"general":-6.46458830369,"writing":-6.563855526532},"bi:in_my":{"app":-6.5750758406,"code-help":-5.221706264176,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:in_plain":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.433722003554,"general":-6.46458830369,"writing":-5.870708345972},"bi:in_simple":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.433722003554,"general":-6.46458830369,"writing":-6.563855526532},"bi:in_the":{"app":-5.88192866004,"code-help":-6.608000625296,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-6.563855526532},"bi:indexes_in":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.433722003554,"general":-6.46458830369,"writing":-6.563855526532},"bi:is_my":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:is_the":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-4.740574822994,"general":-6.46458830369,"writing":-6.563855526532},"bi:is_your":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-6.563855526532},"bi:landing_page":{"app":-4.965637928166,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.870708345972},"bi:launch_email":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.465243237864},"bi:letter_for":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.177561165412},"bi:machine_learning":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.433722003554,"general":-6.46458830369,"writing":-6.563855526532},"bi:make_a":{"app":-4.965637928166,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:me_a":{"app":-5.88192866004,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.870708345972},"bi:me_how":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.433722003554,"general":-6.46458830369,"writing":-6.563855526532},"bi:me_the":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.433722003554,"general":-6.46458830369,"writing":-6.563855526532},"bi:memory_leak":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:message_for":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.465243237864},"bi:my_python":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:page_for":{"app":-5.476463551932,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:plain_english":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-5.870708345972},"bi:polish_this":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.177561165412},"bi:portal_with":{"app":-5.476463551932,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:python_script":{"app":-6.5750758406,"code-help":-5.221706264176,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:remote_work":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.77144112313,"writing":-5.870708345972},"bi:rest_api":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-6.563855526532},"bi:returns_null":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:review_this":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.870708345972},"bi:rewrite_this":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-4.484413984852},"bi:script_that":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:server_side":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-6.563855526532},"bi:ship_a":{"app":-5.476463551932,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:side_rendering":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-5.433722003554,"general":-6.46458830369,"writing":-6.563855526532},"bi:simple_terms":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.433722003554,"general":-6.46458830369,"writing":-6.563855526532},"bi:some_general":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-6.563855526532},"bi:stack_trace":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:summarize_this":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.177561165412},"bi:teach_me":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-4.740574822994,"general":-6.46458830369,"writing":-6.563855526532},"bi:tell_me":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-6.532334292222,"general":-5.77144112313,"writing":-6.563855526532},"bi:text_to":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.465243237864},"bi:thank_you":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-6.563855526532},"bi:thanks_a":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-6.563855526532},"bi:the_difference":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-4.586424143167,"general":-6.46458830369,"writing":-6.563855526532},"bi:this_broken":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:this_react":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:this_technical":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.465243237864},"bi:to_be":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.465243237864},"bi:to_sound":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.465243237864},"bi:to_start":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-6.563855526532},"bi:tool_app":{"app":-5.476463551932,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:web_app":{"app":-5.18878147948,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:web_application":{"app":-5.476463551932,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:website_with":{"app":-5.476463551932,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:what_are":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.146039931102,"general":-4.672828834462,"writing":-6.563855526532},"bi:what_is":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-4.452892750543,"general":-5.77144112313,"writing":-6.563855526532},"bi:why_do":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.146039931102,"general":-6.46458830369,"writing":-6.563855526532},"bi:why_does":{"app":-6.5750758406,"code-help":-4.528559083616,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-6.563855526532},"bi:why_is":{"app":-6.5750758406,"code-help":-5.221706264176,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-6.563855526532},"bi:why_my":{"app":-6.5750758406,"code-help":-5.221706264176,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:why_this":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:widget_with":{"app":-5.476463551932,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:with_drag":{"app":-5.476463551932,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"bi:write_a":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.177561165412},"bi:write_an":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.465243237864},"break":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-4.922896379788,"general":-6.46458830369,"writing":-6.563855526532},"broken":{"app":-6.5750758406,"code-help":-5.221706264176,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"browser":{"app":-5.88192866004,"code-help":-6.608000625296,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-6.563855526532},"bug":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"build":{"app":-4.272490747606,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-5.77144112313,"writing":-6.563855526532},"bullet":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.465243237864},"business":{"app":-5.88192866004,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.870708345972},"by":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-6.563855526532},"calculator":{"app":-4.783316371372,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"call":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.465243237864},"can":{"app":-5.476463551932,"code-help":-5.914853444736,"explanation":-5.839187111662,"general":-4.855150391256,"writing":-5.870708345972},"canvas":{"app":-5.476463551932,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"captions":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.465243237864},"card":{"app":-5.88192866004,"code-help":-6.608000625296,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-6.563855526532},"clean":{"app":-5.88192866004,"code-help":-5.914853444736,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"code":{"app":-6.5750758406,"code-help":-4.998562712862,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"coffee":{"app":-5.88192866004,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.870708345972},"color":{"app":-5.88192866004,"code-help":-6.608000625296,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-6.563855526532},"compare":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.146039931102,"general":-6.46458830369,"writing":-6.563855526532},"component":{"app":-6.5750758406,"code-help":-5.221706264176,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"concept":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.839187111662,"general":-5.77144112313,"writing":-6.563855526532},"concise":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.465243237864},"converter":{"app":-5.476463551932,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"copy":{"app":-5.88192866004,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-4.617945377477},"counter":{"app":-5.476463551932,"code-help":-5.914853444736,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"create":{"app":-4.629165691544,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"css":{"app":-6.5750758406,"code-help":-5.221706264176,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"customer":{"app":-5.88192866004,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.177561165412},"daily":{"app":-5.88192866004,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.77144112313,"writing":-6.563855526532},"dashboard":{"app":-5.476463551932,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"data":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"database":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.433722003554,"general":-6.46458830369,"writing":-6.563855526532},"day":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-6.563855526532},"debug":{"app":-6.5750758406,"code-help":-4.662090476241,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"design":{"app":-4.629165691544,"code-help":-6.608000625296,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-6.563855526532},"develop":{"app":-4.965637928166,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"diagnose":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"difference":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-4.586424143167,"general":-6.46458830369,"writing":-6.563855526532},"do":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-4.586424143167,"general":-4.855150391256,"writing":-6.563855526532},"does":{"app":-6.5750758406,"code-help":-4.528559083616,"explanation":-4.586424143167,"general":-6.46458830369,"writing":-6.563855526532},"down":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-4.922896379788,"general":-6.46458830369,"writing":-6.563855526532},"draft":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-3.85580532543},"drag":{"app":-5.476463551932,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"edit":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.177561165412},"email":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-4.165960253734},"engaging":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.465243237864},"english":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-5.870708345972},"error":{"app":-6.5750758406,"code-help":-4.662090476241,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.870708345972},"errors":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"event":{"app":-5.88192866004,"code-help":-5.509388336628,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-5.870708345972},"executive":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.465243237864},"explain":{"app":-5.88192866004,"code-help":-5.221706264176,"explanation":-4.229749199228,"general":-6.46458830369,"writing":-5.870708345972},"fail":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"fails":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"feedback":{"app":-5.88192866004,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.870708345972},"file":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"fix":{"app":-6.5750758406,"code-help":-3.899950424194,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"for":{"app":-4.010126483138,"code-help":-5.221706264176,"explanation":-5.839187111662,"general":-4.162003210696,"writing":-3.568123252978},"from":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-6.563855526532},"function":{"app":-6.5750758406,"code-help":-4.816241156068,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"game":{"app":-4.965637928166,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"general":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-4.162003210696,"writing":-6.563855526532},"generate":{"app":-4.965637928166,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"generator":{"app":-5.476463551932,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"git":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-6.563855526532},"going":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-6.563855526532},"good":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.07829394257,"writing":-6.563855526532},"graphql":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-6.563855526532},"great":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-6.563855526532},"have":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-4.855150391256,"writing":-6.563855526532},"hello":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.07829394257,"writing":-6.563855526532},"help":{"app":-6.5750758406,"code-help":-4.816241156068,"explanation":-6.532334292222,"general":-5.07829394257,"writing":-5.870708345972},"hey":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-6.563855526532},"hi":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-6.563855526532},"hobbies":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-6.563855526532},"hook":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.870708345972},"how":{"app":-6.5750758406,"code-help":-5.221706264176,"explanation":-3.641962534326,"general":-4.672828834462,"writing":-6.563855526532},"html":{"app":-5.476463551932,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"i":{"app":-5.88192866004,"code-help":-5.509388336628,"explanation":-5.839187111662,"general":-3.979681653902,"writing":-6.563855526532},"ideas":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-6.563855526532},"in":{"app":-5.476463551932,"code-help":-3.968943295681,"explanation":-4.047427642434,"general":-5.77144112313,"writing":-5.870708345972},"index":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-6.563855526532},"indexes":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.433722003554,"general":-6.46458830369,"writing":-6.563855526532},"interactive":{"app":-5.18878147948,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"into":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-4.954417614098},"invitation":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.465243237864},"is":{"app":-6.5750758406,"code-help":-4.816241156068,"explanation":-4.229749199228,"general":-5.07829394257,"writing":-6.563855526532},"it":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-5.839187111662,"general":-5.77144112313,"writing":-5.465243237864},"javascript":{"app":-5.88192866004,"code-help":-5.221706264176,"explanation":-5.433722003554,"general":-6.46458830369,"writing":-6.563855526532},"js":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"json":{"app":-6.5750758406,"code-help":-5.221706264176,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"key":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.839187111662,"general":-5.77144112313,"writing":-5.870708345972},"landing":{"app":-4.965637928166,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.870708345972},"launch":{"app":-5.88192866004,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-4.954417614098},"leak":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"learning":{"app":-5.88192866004,"code-help":-6.608000625296,"explanation":-5.433722003554,"general":-5.77144112313,"writing":-6.563855526532},"letter":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-4.954417614098},"list":{"app":-5.88192866004,"code-help":-5.914853444736,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"looking":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-6.563855526532},"loop":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-6.563855526532},"lot":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-6.563855526532},"machine":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.433722003554,"general":-6.46458830369,"writing":-6.563855526532},"make":{"app":-4.629165691544,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"me":{"app":-5.476463551932,"code-help":-4.998562712862,"explanation":-4.740574822994,"general":-4.672828834462,"writing":-5.465243237864},"memory":{"app":-5.88192866004,"code-help":-5.509388336628,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-6.563855526532},"message":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.177561165412},"mobile":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"modern":{"app":-5.476463551932,"code-help":-6.608000625296,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-6.563855526532},"more":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.77144112313,"writing":-5.465243237864},"morning":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-6.563855526532},"my":{"app":-4.629165691544,"code-help":-3.7176288674,"explanation":-6.532334292222,"general":-4.855150391256,"writing":-5.465243237864},"need":{"app":-5.88192866004,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-6.563855526532},"nested":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"new":{"app":-5.88192866004,"code-help":-5.914853444736,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-5.870708345972},"next":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"nice":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-6.563855526532},"not":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-5.77144112313,"writing":-6.563855526532},"null":{"app":-6.5750758406,"code-help":-5.221706264176,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"o":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.433722003554,"general":-6.46458830369,"writing":-6.563855526532},"of":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-4.922896379788,"general":-6.46458830369,"writing":-5.870708345972},"office":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.77144112313,"writing":-5.870708345972},"on":{"app":-6.5750758406,"code-help":-4.816241156068,"explanation":-6.532334292222,"general":-5.07829394257,"writing":-6.563855526532},"online":{"app":-5.88192866004,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.77144112313,"writing":-6.563855526532},"our":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-4.954417614098},"out":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.77144112313,"writing":-5.870708345972},"page":{"app":-4.629165691544,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.870708345972},"plain":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.433722003554,"general":-6.46458830369,"writing":-5.870708345972},"please":{"app":-5.88192866004,"code-help":-5.914853444736,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"points":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.465243237864},"polish":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-4.954417614098},"portal":{"app":-4.965637928166,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"position":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.870708345972},"post":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.465243237864},"prepare":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-6.563855526532},"preview":{"app":-5.476463551932,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"product":{"app":-5.476463551932,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.465243237864},"productivity":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-5.870708345972},"professional":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.465243237864},"project":{"app":-5.88192866004,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.77144112313,"writing":-5.870708345972},"prototype":{"app":-5.476463551932,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"public":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.839187111662,"general":-5.77144112313,"writing":-6.563855526532},"python":{"app":-6.5750758406,"code-help":-4.998562712862,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"query":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"quick":{"app":-5.88192866004,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.870708345972},"react":{"app":-5.88192866004,"code-help":-4.998562712862,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"regex":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"release":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.177561165412},"remote":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.77144112313,"writing":-5.870708345972},"rendering":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-5.433722003554,"general":-6.46458830369,"writing":-6.563855526532},"response":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"rest":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-6.563855526532},"returns":{"app":-6.5750758406,"code-help":-5.221706264176,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"review":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-4.954417614098},"rewrite":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-4.366630949196},"rough":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-6.563855526532},"script":{"app":-6.5750758406,"code-help":-5.221706264176,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.870708345972},"server":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-5.870708345972},"servers":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.433722003554,"general":-6.46458830369,"writing":-6.563855526532},"ship":{"app":-5.18878147948,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"short":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.465243237864},"side":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-5.433722003554,"general":-6.46458830369,"writing":-6.563855526532},"simple":{"app":-4.965637928166,"code-help":-6.608000625296,"explanation":-5.146039931102,"general":-6.46458830369,"writing":-6.563855526532},"site":{"app":-5.18878147948,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"so":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-5.870708345972},"software":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.77144112313,"writing":-5.870708345972},"some":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-4.855150391256,"writing":-6.563855526532},"sound":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.465243237864},"sounds":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.77144112313,"writing":-5.870708345972},"source":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-5.870708345972},"sql":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-6.563855526532},"stack":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"start":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-6.563855526532},"state":{"app":-5.476463551932,"code-help":-5.221706264176,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-6.563855526532},"status":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.870708345972},"step":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-5.433722003554,"general":-6.46458830369,"writing":-6.563855526532},"store":{"app":-5.88192866004,"code-help":-6.608000625296,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-6.563855526532},"suggestions":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-6.563855526532},"summarize":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-4.772096057304},"summary":{"app":-5.88192866004,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.465243237864},"systems":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.433722003554,"general":-6.46458830369,"writing":-6.563855526532},"task":{"app":-5.88192866004,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.77144112313,"writing":-6.563855526532},"teach":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-4.740574822994,"general":-6.46458830369,"writing":-6.563855526532},"technical":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.465243237864},"tell":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-6.532334292222,"general":-5.77144112313,"writing":-6.563855526532},"terms":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.433722003554,"general":-6.46458830369,"writing":-6.563855526532},"text":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-4.772096057304},"thank":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-6.563855526532},"thanks":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-4.855150391256,"writing":-6.563855526532},"that":{"app":-5.88192866004,"code-help":-5.221706264176,"explanation":-6.532334292222,"general":-4.855150391256,"writing":-6.563855526532},"the":{"app":-5.476463551932,"code-help":-4.998562712862,"explanation":-3.893276962607,"general":-6.46458830369,"writing":-5.870708345972},"this":{"app":-6.5750758406,"code-help":-3.77478728124,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-3.730642182476},"thoughts":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-6.563855526532},"thread":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-5.870708345972},"throwing":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"time":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.433722003554,"general":-6.46458830369,"writing":-6.563855526532},"timer":{"app":-5.18878147948,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"tips":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-5.870708345972},"to":{"app":-6.5750758406,"code-help":-4.528559083616,"explanation":-4.740574822994,"general":-3.979681653902,"writing":-4.165960253734},"today":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.365976015022,"writing":-6.563855526532},"tool":{"app":-4.49563429892,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.870708345972},"trace":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"two":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-5.870708345972},"typescript":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"u":{"app":-5.88192866004,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-5.77144112313,"writing":-6.563855526532},"undefined":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"unit":{"app":-5.88192866004,"code-help":-5.914853444736,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"up":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-5.870708345972},"update":{"app":-6.5750758406,"code-help":-5.914853444736,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-5.870708345972},"using":{"app":-5.88192866004,"code-help":-6.608000625296,"explanation":-5.839187111662,"general":-6.46458830369,"writing":-6.563855526532},"versus":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.433722003554,"general":-6.46458830369,"writing":-6.563855526532},"web":{"app":-4.629165691544,"code-help":-5.914853444736,"explanation":-4.922896379788,"general":-6.46458830369,"writing":-6.563855526532},"website":{"app":-4.965637928166,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"what":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-4.047427642434,"general":-4.066693030892,"writing":-6.563855526532},"when":{"app":-6.5750758406,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-5.77144112313,"writing":-6.563855526532},"why":{"app":-6.5750758406,"code-help":-3.7176288674,"explanation":-4.586424143167,"general":-6.46458830369,"writing":-5.870708345972},"widget":{"app":-4.629165691544,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-6.563855526532},"with":{"app":-4.090169190812,"code-help":-6.608000625296,"explanation":-5.839187111662,"general":-5.07829394257,"writing":-5.870708345972},"work":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-5.146039931102,"general":-5.365976015022,"writing":-5.870708345972},"write":{"app":-5.88192866004,"code-help":-5.509388336628,"explanation":-6.532334292222,"general":-6.46458830369,"writing":-4.165960253734},"you":{"app":-5.88192866004,"code-help":-6.608000625296,"explanation":-5.839187111662,"general":-4.066693030892,"writing":-5.870708345972},"your":{"app":-6.5750758406,"code-help":-6.608000625296,"explanation":-6.532334292222,"general":-4.518678154635,"writing":-6.563855526532}}'),v6=.55,x6=.7,wt={labels:h6,vocabulary:g6,logPriors:m6,tokenLogLikelihoods:y6,minConfidence:v6,maxOovRatio:x6};function w6(m){if(typeof m!="string")return[];const x=m.normalize("NFKC").toLowerCase().match(/[a-z0-9]+(?:'[a-z0-9]+)*/g)||[],v=[];for(let I=0;I<x.length-1;I++)v.push(`bi:${x[I]}_${x[I+1]}`);return[...x,...v].slice(0,512)}function $u(m,y=12){const o=Math.pow(10,y);return Math.round(m*o)/o}function E6(m){if(!m||typeof m!="string"||!m.trim())return{label:"general",confidence:0,oovRatio:0,accepted:!1};const y=w6(m);if(y.length===0)return{label:"general",confidence:0,oovRatio:0,accepted:!1};const o=new Set(wt.vocabulary);let x=0;for(const P of y)o.has(P)||x++;const v=$u(x/y.length,4),b={};for(const P of wt.labels){let W=wt.logPriors[P];for(const Q of y)o.has(Q)&&wt.tokenLogLikelihoods[Q]&&(W+=wt.tokenLogLikelihoods[Q][P]);b[P]=W}let I=-1/0;for(const P of wt.labels)b[P]>I&&(I=b[P]);let z=0;const N={};for(const P of wt.labels){const W=Math.exp(b[P]-I);N[P]=W,z+=W}let H=wt.labels[0],U=-1;for(const P of wt.labels){const W=$u(N[P]/z,6);W>U&&(U=W,H=P)}const T=wt.minConfidence,L=wt.maxOovRatio,$=U>=T&&v<=L;return{label:H,confidence:U,oovRatio:v,accepted:$}}const S6="/api/ai",k6="/api/image",C6=/\b(game|gamedev|game development|play|chess|snake|pong|shooter|arcade|platformer|canvas game|2d game|3d game|simulator|physics sandbox|bot enemy|rpg|enemy|space defender|retro game|interactive game)\b|\b(build|make|create|develop|design)\b.*\b(game|simulator|simulation|sandbox)\b/i;function R6(m){return m?C6.test(m):!1}const Ar={app:/\b(build|make|create|generate|design|launch|prototype|develop|ship)\b.*\b(app|tool|website|site|landing page|dashboard|portal|widget|calculator|timer|game|simulator|preview|html|bot|enemy)\b|\b(app|tool|website|site|landing page|dashboard|portal|widget|calculator|timer|game|simulator|bot|enemy)\b.*\b(build|make|create|generate|design|launch|prototype|develop|ship)\b|\b(game|play|chess|snake|pong|shooter|quiz|puzzle|simulator|canvas|bot|enemy)\b/i,code:/\b(code|debug|bug|fix|error|javascript|typescript|python|react|css|html|component|function|api|compile|stack trace)\b/i,writing:/\b(write|rewrite|copy|caption|email|post|bio|headline|script|summarize|summary|proposal|description|landing copy)\b/i,explanation:/\b(explain|what is|what are|how does|why does|teach me|break down|understand|compare)\b/i,swarm:/\b(swarm|multi-agent|agents|orchestrate|orchestration|superpowers|plan|architect|complex)\b/i};function T6(m){const y=m.toLowerCase();return Ar.app.test(m)?{type:"app",summary:"Create a public-facing interactive experience or web tool.",responseStrategy:"Build a runnable monochrome HTML preview when enough intent is present."}:Ar.code.test(m)?{type:"code-help",summary:"Help the user understand, debug, or improve code.",responseStrategy:"Ask for the relevant snippet when the code is missing; otherwise explain the fix clearly."}:Ar.writing.test(m)?{type:"writing",summary:"Help the user shape public-facing words or content.",responseStrategy:"Offer a concise draft or rewrite with a clear tone."}:Ar.explanation.test(y)?{type:"explanation",summary:"Explain the topic in plain language.",responseStrategy:"Give a direct answer with the minimum useful context."}:Ar.swarm.test(y)?{type:"swarm",summary:"Coordinate multiple agents for a complex task.",responseStrategy:"Provide a robust architectural overview and step-by-step reasoning."}:{type:"general",summary:"Understand the public user goal and give a useful next step.",responseStrategy:"Clarify the likely intent, answer directly, and invite the next concrete detail."}}function Ha(m){const y=m?m.trim():"";if(!y)return{type:"general",summary:"Understand the public user goal and give a useful next step.",responseStrategy:"Clarify the likely intent, answer directly, and invite the next concrete detail.",confidence:0,source:"default"};let o;try{o=E6(y)}catch{o={accepted:!1,confidence:0}}if(o&&o.accepted)switch(o.label){case"app":return{type:"app",summary:"Create a public-facing interactive experience or web tool.",responseStrategy:"Build a runnable monochrome HTML preview when enough intent is present.",confidence:o.confidence,source:"model"};case"code-help":return{type:"code-help",summary:"Help the user understand, debug, or improve code.",responseStrategy:"Ask for the relevant snippet when the code is missing; otherwise explain the fix clearly.",confidence:o.confidence,source:"model"};case"writing":return{type:"writing",summary:"Help the user shape public-facing words or content.",responseStrategy:"Offer a concise draft or rewrite with a clear tone.",confidence:o.confidence,source:"model"};case"explanation":return{type:"explanation",summary:"Explain the topic in plain language.",responseStrategy:"Give a direct answer with the minimum useful context.",confidence:o.confidence,source:"model"};case"general":default:return{type:"general",summary:"Understand the public user goal and give a useful next step.",responseStrategy:"Clarify the likely intent, answer directly, and invite the next concrete detail.",confidence:o.confidence,source:"model"}}return{...T6(y),confidence:(o==null?void 0:o.confidence)??0,source:"rules"}}function b6(m){var L;const y=(m||"8-Bit Asset").slice(0,40),o=y.toLowerCase();let x="badge";o.includes("sword")||o.includes("blade")||o.includes("weapon")?x="sword":o.includes("shield")||o.includes("armor")||o.includes("defense")?x="shield":o.includes("potion")||o.includes("flask")||o.includes("magic")||o.includes("elixir")?x="potion":o.includes("chest")||o.includes("crate")||o.includes("treasure")||o.includes("loot")?x="chest":o.includes("knight")||o.includes("hero")||o.includes("character")||o.includes("player")?x="hero":o.includes("monster")||o.includes("enemy")||o.includes("skull")||o.includes("boss")?x="monster":(o.includes("gem")||o.includes("star")||o.includes("coin")||o.includes("crystal"))&&(x="gem");const v={".":null,B:"#12121e",W:"#ffffff",G:"#f1fa8c",R:"#ff5555",C:"#8be9fd",P:"#bd93f9",S:"#f8f8f2",O:"#ffb86c",K:"#6272a4",E:"#50fa7b",D:"#44475a",M:"#ff79c6"},b={sword:["................","...............W","..............WS",".............WSK","............WSK.","...........WSK..","..........WSK...",".........WSK....","........WSK.....","..M...M.SK......","..MMM.MKK.......","...MMMMK........","....MMMD........","...D..D.........","..D.............","................"],shield:["................",".BBBBBBBBBBBBBB.",".BWWWWWWWWWWWWB.",".BWGGGGGGGGGGWB.",".BWGPPBBPPEGGWB.",".BWGPPPPPEEGGWB.",".BWGPEEEEEEGGWB.",".BWGPEEEEEEGGWB.","..BWGPEEEEGGWB..","...BWGPEEEGGWB..","....BWGPEEGGB...",".....BWGPEGB....","......BWGPEB....",".......BWGB.....","........BBB.....","................"],potion:["................","......DDDD......","......DGGGD.....","......DDDD......",".......BB.......","......BCCB......",".....BCCCCCCB...","....BCCCCCCB....","...BCCCCWWCCB...","...BCCCCWWCCB...","...BCCCCWWCCB...","...BCCCCWWCCB...","...BCCCCWWCCB...","....BCCCCCCB....",".....BBBBBB.....","................"],chest:["................","..BBBBBBBBBBBB..",".BDDDDDDDDDDDDB.",".BDDGGGGGGGGDDB.",".BDDDDDDDDDDDDB.",".BBBBBBBBBBBBBB.",".BDDDDDGGDDDDDB.",".BDDDDDBBDDDDDB.",".BDDDDDBGDDDDDB.",".BDDDDDBGDDDDDB.",".BDDDDDGGDDDDDB.",".BDDDDDDDDDDDDB.",".BDDGGGGGGGGDDB.","..BBBBBBBBBBBB..","................"],hero:["................","......RRRR......",".....RRRRRR.....","......BBBB......",".....BSSSSB.....",".....BSWWSB.....",".....BSSSSB.....","....BBBBBBBB....","...BKKKKKKKKB...","..BKKKSSSSKKKB..","..BKKKSSSSKKKB..","..BKKKSSSSKKKB..","...BKKKKKKKKB...","....BSSSSSSB....","....BSS..SSB....","....BB....BB...."],monster:["................",".....BBBBBB.....","....BWWWWWWB....","...BWWWWWWWWB...","...BWWRRWWRRB...","...BWWRRWWRRB...","...BWWWWWWWWB...","....BWWBBWWB....","....BWWBBWWB....",".....BBBBBB.....","....BWWWWWWB....","....BWBBBBWB....","....BWWWWWWB....",".....BBBBBB.....","................"],gem:["................",".......WW.......","......WGGW......",".....WGGGGW.....","....WGGGGGGW....","...WGGGGGGGGW...","..WGGGGWWGGGGW..",".WGGGGGWWGGGGGW.","..WGGGGWWGGGGW..","...WGGGGGGGGW...","....WGGGGGGW....",".....WGGGGW.....","......WGGW......",".......WW.......","................"],badge:["................","..BBBBBBBBBBBB..",".BGGGGGGGGGGGGB.",".BGWWWWWWWWWWGB.",".BGWMMM..MMMWGB.",".BGWMMMMMMMMWGB.",".BGWMMMMMMMMWGB.",".BGW.MMMMMM.WGB.",".BGW..MMMM..WGB.",".BGW...MM...WGB.",".BGWWWWWWWWWWGB.",".BGGGGGGGGGGGGB.","..BBBBBBBBBBBB..","................","................","................"]},I=b[x]||b.badge,z=16,N=128;let H="";for(let $=0;$<16;$++)for(let P=0;P<16;P++){const W=(L=I[$])==null?void 0:L[P],Q=v[W];if(Q){const he=N+P*z,ce=N+$*z;H+=`<rect x="${he}" y="${ce}" width="${z}" height="${z}" fill="${Q}" />`}}const U=y.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"),T=`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 512 512" shape-rendering="crispEdges">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#0a0915" />
        <stop offset="60%" stop-color="#19152b" />
        <stop offset="100%" stop-color="#2d1b40" />
      </linearGradient>
      <pattern id="pixelGrid" width="16" height="16" patternUnits="userSpaceOnUse">
        <path d="M 16 0 L 0 0 0 16" fill="none" stroke="rgba(255,255,255,0.02)" stroke-width="1" />
      </pattern>
    </defs>
    <!-- Clean Dark Backdrop with Pixel Grid -->
    <rect width="512" height="512" fill="url(#bg)" />
    <rect width="512" height="512" fill="url(#pixelGrid)" />

    <!-- Outer 8-Bit Border Frame -->
    <rect x="24" y="24" width="464" height="464" fill="none" stroke="#6272a4" stroke-width="4" />
    <rect x="32" y="32" width="448" height="448" fill="none" stroke="#ff79c6" stroke-width="2" />
    
    <!-- Corner Pixel Accents -->
    <rect x="20" y="20" width="12" height="12" fill="#ff79c6" />
    <rect x="480" y="20" width="12" height="12" fill="#ff79c6" />
    <rect x="20" y="480" width="12" height="12" fill="#ff79c6" />
    <rect x="480" y="480" width="12" height="12" fill="#ff79c6" />

    <!-- 8-Bit Tag Header -->
    <rect x="136" y="48" width="240" height="28" fill="#12121e" stroke="#f1fa8c" stroke-width="2" />
    <text x="256" y="67" font-family="'Courier New', monospace" font-size="13" font-weight="bold" fill="#f1fa8c" text-anchor="middle" letter-spacing="2">ITCH.IO 8-BIT ASSET</text>

    <!-- Sprite Shadow Grid -->
    <rect x="${N+12}" y="${N+12}" width="256" height="256" fill="rgba(0,0,0,0.4)" />

    <!-- Scaled 16x16 Pixel Sprite -->
    ${H}

    <!-- Prompt Footer Badge -->
    <rect x="56" y="416" width="400" height="44" fill="#12121e" stroke="#bd93f9" stroke-width="2" />
    <text x="256" y="442" font-family="'Courier New', monospace" font-size="14" font-weight="bold" fill="#50fa7b" text-anchor="middle" letter-spacing="1">${U.toUpperCase()}</text>
  </svg>`;return`data:image/svg+xml;utf8,${encodeURIComponent(T)}`}async function za(m,y=null){try{const o={method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt:m})};y&&(o.signal=y);const x=await fetch(k6,o);if(x.ok){const v=await x.json();if(v!=null&&v.image)return v.image}}catch(o){if((o==null?void 0:o.name)==="AbortError")throw o;console.warn("Hosted FLUX API request failed; rendering fallback visual.",o)}return b6(m)}async function N6(m,y=Ha(m),o=[],x=null){var z;const v={method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt:m,intent:y,messages:o})};x&&(v.signal=x);const b=await fetch(S6,v);if(!b.ok)throw new Error(`Hosted AI request failed with status ${b.status}`);const I=await b.json();return((z=I==null?void 0:I.content)==null?void 0:z.trim())||null}function Ku(m){if(!m)return null;const y=m.match(/```(?:html|xml|jsx|tsx)?\s*([\s\S]*?)```/i);if(y&&y[1].trim()){const x=y[1].trim();if(x.includes("<html")||x.includes("<div")||x.includes("<script")||x.includes("<style"))return x}const o=m.match(/```\s*([\s\S]*?)```/);return o&&o[1].includes("<")?o[1].trim():null}function A6(m=!1){return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>COREZ Chess</title>
  <style>
    :root {
      --bg: #09090b;
      --card: #121215;
      --border: #27272a;
      --text: #f4f4f5;
      --text-muted: #a1a1aa;
      --sq-light: #27272a;
      --sq-dark: #18181b;
      --sq-select: #3f3f46;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1rem; }
    .game-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; width: 100%; max-width: 460px; text-align: center; box-shadow: 0 4px 16px rgba(0,0,0,0.25); }
    h1 { font-size: 1.25rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 0.75rem; color: #fff; }
    .status-bar { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.85rem; display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.75rem; background: rgba(255,255,255,0.03); border-radius: 6px; border: 1px solid var(--border); }
    .board { display: grid; grid-template-columns: repeat(8, 1fr); grid-template-rows: repeat(8, 1fr); aspect-ratio: 1; border: 2px solid var(--border); border-radius: 6px; overflow: hidden; margin-bottom: 1rem; }
    .square { display: flex; align-items: center; justify-content: center; font-size: 2.2rem; cursor: pointer; user-select: none; transition: background 0.15s ease; position: relative; }
    .square.light { background-color: var(--sq-light); }
    .square.dark { background-color: var(--sq-dark); }
    .square.selected { background-color: var(--sq-select) !important; outline: 2px solid #fff; outline-offset: -2px; }
    .square.valid-move::after { content: ''; width: 12px; height: 12px; background: rgba(255,255,255,0.5); border-radius: 50%; position: absolute; }
    .controls { display: flex; gap: 0.5rem; justify-content: center; }
    .btn { background: #ffffff; color: #000000; border: none; padding: 0.6rem 1.2rem; border-radius: 6px; font-weight: 700; font-size: 0.75rem; cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em; }
    .btn:hover { opacity: 0.9; }
    .btn-sec { background: transparent; color: var(--text); border: 1px solid var(--border); }
    .btn-sec:hover { background: rgba(255,255,255,0.05); }
  </style>
</head>
<body>
  <div class="game-card">
    <h1>COREZ CHESS</h1>
    <div class="status-bar">
      <span id="status">White's Turn</span>
      <span id="mode">${m?"1-Player vs Bot":"Interactive 2-Player"}</span>
    </div>
    <div class="board" id="board"></div>
    <div class="controls">
      <button class="btn" id="resetBtn">New Game</button>
      <button class="btn btn-sec" id="flipBtn">Flip Board</button>
    </div>
  </div>
  <script>
    const WITH_BOT = ${m};
    const INITIAL_BOARD = [
      ['r','n','b','q','k','b','n','r'],
      ['p','p','p','p','p','p','p','p'],
      ['','','','','','','',''],
      ['','','','','','','',''],
      ['','','','','','','',''],
      ['','','','','','','',''],
      ['P','P','P','P','P','P','P','P'],
      ['R','N','B','Q','K','B','N','R']
    ];
    const SYMBOLS = {
      'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
      'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
    };
    let board = [], turn = 'W', selected = null, flipped = false;

    function init() {
      board = INITIAL_BOARD.map(r => [...r]);
      turn = 'W'; selected = null; render();
    }
    function isW(p) { return p && p === p.toUpperCase(); }
    function isB(p) { return p && p === p.toLowerCase(); }

    function getMoves(r, c) {
      const p = board[r][c];
      if (!p || (turn === 'W' && !isW(p)) || (turn === 'B' && !isB(p))) return [];
      const moves = [], white = isW(p), type = p.toLowerCase();
      const check = (nr, nc) => {
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const t = board[nr][nc];
          if (!t) { moves.push([nr, nc]); return true; }
          if (white ? isB(t) : isW(t)) moves.push([nr, nc]);
        }
        return false;
      };
      if (type === 'p') {
        const dir = white ? -1 : 1, startRow = white ? 6 : 1;
        if (r + dir >= 0 && r + dir < 8 && !board[r + dir][c]) {
          moves.push([r + dir, c]);
          if (r === startRow && !board[r + 2 * dir][c]) moves.push([r + 2 * dir, c]);
        }
        [-1, 1].forEach(dc => {
          const nr = r + dir, nc = c + dc;
          if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
            const t = board[nr][nc];
            if (t && (white ? isB(t) : isW(t))) moves.push([nr, nc]);
          }
        });
      } else if (type === 'n') {
        [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr, dc]) => check(r + dr, c + dc));
      } else if (type === 'k') {
        [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr, dc]) => check(r + dr, c + dc));
      } else {
        const dirs = type === 'r' ? [[-1,0],[1,0],[0,-1],[0,1]] :
                     type === 'b' ? [[-1,-1],[-1,1],[1,-1],[1,1]] :
                     [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
        dirs.forEach(([dr, dc]) => {
          let nr = r + dr, nc = c + dc;
          while (check(nr, nc)) { nr += dr; nc += dc; }
        });
      }
      return moves;
    }

    function onClick(r, c) {
      if (WITH_BOT && turn === 'B') return;
      if (selected) {
        const [sr, sc] = selected;
        const valid = getMoves(sr, sc);
        if (valid.some(([vr, vc]) => vr === r && vc === c)) {
          board[r][c] = board[sr][sc];
          board[sr][sc] = '';
          turn = turn === 'W' ? 'B' : 'W';
          selected = null;
          render();
          if (WITH_BOT && turn === 'B') {
            setTimeout(botMove, 500);
          }
          return;
        }
      }
      const p = board[r][c];
      if (p && ((turn === 'W' && isW(p)) || (turn === 'B' && isB(p)))) {
        selected = [r, c];
      } else {
        selected = null;
      }
      render();
    }
    
    function botMove() {
      const allMoves = [];
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          const p = board[i][j];
          if (p && isB(p)) {
            const moves = getMoves(i, j);
            moves.forEach(([vr, vc]) => allMoves.push({ from: [i, j], to: [vr, vc] }));
          }
        }
      }
      if (allMoves.length > 0) {
        const m = allMoves[Math.floor(Math.random() * allMoves.length)];
        board[m.to[0]][m.to[1]] = board[m.from[0]][m.from[1]];
        board[m.from[0]][m.from[1]] = '';
        turn = 'W';
        render();
      }
    }

    function render() {
      const el = document.getElementById('board');
      el.innerHTML = '';
      document.getElementById('status').textContent = turn === 'W' ? "White's Turn" : "Black's Turn";
      const valid = selected ? getMoves(selected[0], selected[1]) : [];
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          const r = flipped ? 7 - i : i;
          const c = flipped ? 7 - j : j;
          const sq = document.createElement('div');
          sq.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
          if (selected && selected[0] === r && selected[1] === c) sq.classList.add('selected');
          if (valid.some(([vr, vc]) => vr === r && vc === c)) sq.classList.add('valid-move');
          const p = board[r][c];
          if (p) {
            sq.textContent = SYMBOLS[p] || p;
            sq.style.color = isW(p) ? '#ffffff' : '#a1a1aa';
          }
          sq.onclick = () => onClick(r, c);
          el.appendChild(sq);
        }
      }
    }

    document.getElementById('resetBtn').onclick = init;
    document.getElementById('flipBtn').onclick = () => { flipped = !flipped; render(); };
    init();
  <\/script>
</body>
</html>`}function O6(){return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>COREZ Retro Space Defender</title>
  <style>
    :root {
      --bg: #050508;
      --card: #0d0d12;
      --border: #1f1f2e;
      --text: #00ffcc;
      --accent: #ff0055;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Courier New', monospace; }
    body { background: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1rem; }
    .game-card { background: var(--card); border: 2px solid var(--border); border-radius: 8px; padding: 1.25rem; width: 100%; max-width: 480px; text-align: center; box-shadow: 0 0 15px rgba(0,255,204,0.08); }
    h1 { font-size: 1.3rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 0.75rem; text-shadow: 0 0 10px var(--text); }
    .status-bar { font-size: 0.85rem; color: #a1a1aa; margin-bottom: 0.75rem; display: flex; justify-content: space-between; padding: 0.5rem 0.75rem; background: rgba(0,255,204,0.05); border-radius: 4px; border: 1px solid var(--border); }
    canvas { background: #000005; border: 1px solid var(--border); border-radius: 4px; display: block; margin: 0 auto 0.75rem auto; width: 100%; aspect-ratio: 1.33; cursor: crosshair; }
    .btn { background: var(--text); color: #000; border: none; padding: 0.6rem 1.2rem; border-radius: 4px; font-weight: 700; font-size: 0.8rem; cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em; transition: 0.2s; }
    .btn:hover { background: #fff; box-shadow: 0 0 15px var(--text); }
  </style>
</head>
<body>
  <div class="game-card">
    <h1>RETRO SPACE DEFENDER</h1>
    <div class="status-bar">
      <span id="scoreText">SCORE: 0</span>
      <span id="livesText">LIVES: 3</span>
    </div>
    <canvas id="c" width="400" height="300"></canvas>
    <button class="btn" id="startBtn">Launch Mission</button>
  </div>
  <script>
    const canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
    let pX = 180, score = 0, lives = 3, bullets = [], enemies = [], stars = [], particles = [], loop = null, active = false;

    for (let i = 0; i < 50; i++) {
      stars.push({ x: Math.random()*400, y: Math.random()*300, s: Math.random()*1.5 + 0.5 });
    }

    canvas.onmousemove = e => {
      const r = canvas.getBoundingClientRect();
      pX = Math.max(10, Math.min(370, e.clientX - r.left - 15));
    };

    canvas.onclick = () => {
      if (active) bullets.push({ x: pX + 13, y: 270 });
    };

    function start() {
      pX = 180; score = 0; lives = 3; bullets = []; enemies = []; particles = []; active = true;
      document.getElementById('scoreText').textContent = 'SCORE: ' + score;
      document.getElementById('livesText').textContent = 'LIVES: ' + lives;
      if (loop) clearInterval(loop);
      loop = setInterval(update, 1000/60);
    }

    function update() {
      ctx.fillStyle = '#000005'; ctx.fillRect(0, 0, 400, 300);
      ctx.fillStyle = '#ffffff';
      stars.forEach(st => {
        st.y += st.s * 0.5;
        if (st.y > 300) st.y = 0;
        ctx.fillRect(st.x, st.y, st.s, st.s);
      });

      if (!active) return;

      score++;
      if (score % 40 === 0) {
        enemies.push({ x: Math.random()*360, y: -20, s: 1.5 + Math.random()*2, w: 24, h: 20 });
      }

      ctx.fillStyle = '#00ffcc';
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i]; b.y -= 7;
        ctx.fillRect(b.x, b.y, 4, 10);
        if (b.y < -10) bullets.splice(i, 1);
      }

      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i]; e.y += e.s;
        ctx.fillStyle = '#ff0055';
        ctx.fillRect(e.x, e.y, e.w, e.h);
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(e.x + 6, e.y + 6, 12, 8);

        for (let j = bullets.length - 1; j >= 0; j--) {
          const b = bullets[j];
          if (b.x > e.x && b.x < e.x + e.w && b.y > e.y && b.y < e.y + e.h) {
            for (let k = 0; k < 8; k++) {
              particles.push({ x: e.x + 12, y: e.y + 10, vx: (Math.random()-0.5)*4, vy: (Math.random()-0.5)*4, life: 15 });
            }
            score += 100;
            enemies.splice(i, 1);
            bullets.splice(j, 1);
            break;
          }
        }

        if (e && pX < e.x + e.w && pX + 30 > e.x && 270 < e.y + e.h && 290 > e.y) {
          lives--;
          enemies.splice(i, 1);
          document.getElementById('livesText').textContent = 'LIVES: ' + lives;
          if (lives <= 0) {
            active = false;
            clearInterval(loop);
            alert('GAME OVER! Final Score: ' + score);
            return;
          }
        }

        if (e && e.y > 300) enemies.splice(i, 1);
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.life--;
        ctx.fillStyle = '#ff9900';
        ctx.fillRect(p.x, p.y, 3, 3);
        if (p.life <= 0) particles.splice(i, 1);
      }

      ctx.fillStyle = '#00ffcc';
      ctx.beginPath();
      ctx.moveTo(pX + 15, 265);
      ctx.lineTo(pX, 290);
      ctx.lineTo(pX + 30, 290);
      ctx.closePath();
      ctx.fill();

      document.getElementById('scoreText').textContent = 'SCORE: ' + score;
    }

    document.getElementById('startBtn').onclick = start;
    start();
  <\/script>
</body>
</html>`}function I6(){return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Bot Enemy Simulator</title>
  <style>
    body { background: #111; color: #fff; font-family: monospace; text-align: center; margin-top: 50px; }
    #arena { width: 400px; height: 400px; background: #222; border: 2px solid #555; position: relative; margin: 0 auto; overflow: hidden; }
    .bot { width: 30px; height: 30px; background: red; position: absolute; border-radius: 5px; display: flex; align-items: center; justify-content: center; font-weight: bold; }
    .player { width: 30px; height: 30px; background: blue; position: absolute; border-radius: 15px; }
  </style>
</head>
<body>
  <h2>Bot Enemy Arena</h2>
  <div id="arena">
    <div id="player" class="player" style="left: 185px; top: 185px;"></div>
  </div>
  <p>Use arrow keys to move. Avoid the red bot enemy!</p>
  <script>
    const player = document.getElementById('player');
    const arena = document.getElementById('arena');
    let px = 185, py = 185;
    
    const bot = document.createElement('div');
    bot.className = 'bot';
    bot.innerText = 'X';
    bot.style.left = '10px';
    bot.style.top = '10px';
    arena.appendChild(bot);
    
    let bx = 10, by = 10;
    let bSpeed = 1.5;
    
    document.addEventListener('keydown', (e) => {
      const speed = 10;
      if (e.key === 'ArrowUp') py = Math.max(0, py - speed);
      if (e.key === 'ArrowDown') py = Math.min(370, py + speed);
      if (e.key === 'ArrowLeft') px = Math.max(0, px - speed);
      if (e.key === 'ArrowRight') px = Math.min(370, px + speed);
      player.style.left = px + 'px';
      player.style.top = py + 'px';
    });
    
    function updateBot() {
      if (bx < px) bx += bSpeed;
      else if (bx > px) bx -= bSpeed;
      if (by < py) by += bSpeed;
      else if (by > py) by -= bSpeed;
      
      bot.style.left = bx + 'px';
      bot.style.top = by + 'px';
      
      if (Math.abs(bx - px) < 30 && Math.abs(by - py) < 30) {
        alert('You were caught by the bot enemy!');
        px = 185; py = 185; bx = 10; by = 10;
      }
      
      requestAnimationFrame(updateBot);
    }
    updateBot();
  <\/script>
</body>
</html>`}function _6(){return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>COREZ Wordle Master</title>
  <style>
    :root {
      --bg: #09090b;
      --card: #121215;
      --border: #27272a;
      --text: #f4f4f5;
      --text-muted: #a1a1aa;
      --correct: #10b981;
      --present: #eab308;
      --absent: #3f3f46;
      --tile-border: #3f3f46;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1rem; }
    .game-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; width: 100%; max-width: 440px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
    h1 { font-size: 1.25rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 0.3rem; color: #fff; }
    .subtitle { font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem; }
    .grid { display: grid; grid-template-rows: repeat(6, 1fr); gap: 6px; margin-bottom: 1.2rem; }
    .row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
    .tile { aspect-ratio: 1; border: 2px solid var(--tile-border); border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 700; text-transform: uppercase; user-select: none; transition: transform 0.15s ease, background-color 0.3s ease; }
    .tile.filled { border-color: #71717a; animation: pop 0.1s ease; }
    .tile.correct { background: var(--correct) !important; border-color: var(--correct) !important; color: #fff; }
    .tile.present { background: var(--present) !important; border-color: var(--present) !important; color: #fff; }
    .tile.absent { background: var(--absent) !important; border-color: var(--absent) !important; color: #a1a1aa; }
    .keyboard { display: flex; flex-direction: column; gap: 6px; width: 100%; }
    .kb-row { display: flex; justify-content: center; gap: 4px; }
    .key { background: #27272a; color: var(--text); border: none; border-radius: 4px; padding: 0.6rem 0.4rem; font-weight: 700; font-size: 0.8rem; cursor: pointer; text-transform: uppercase; user-select: none; flex: 1; max-width: 36px; transition: background 0.2s; }
    .key.wide { flex: 1.5; max-width: 58px; font-size: 0.7rem; }
    .key:hover { background: #3f3f46; }
    .key.correct { background: var(--correct); color: #fff; }
    .key.present { background: var(--present); color: #fff; }
    .key.absent { background: #18181b; color: #52525b; }
    .toast { position: fixed; top: 1.5rem; left: 50%; transform: translateX(-50%); background: #ef4444; color: #fff; padding: 0.6rem 1.2rem; border-radius: 6px; font-size: 0.85rem; font-weight: 600; opacity: 0; transition: opacity 0.3s ease; pointer-events: none; z-index: 10; }
    .toast.show { opacity: 1; }
    .controls { margin-top: 1rem; display: flex; justify-content: center; gap: 0.5rem; }
    .btn { background: #fff; color: #000; border: none; padding: 0.6rem 1.2rem; border-radius: 6px; font-weight: 700; font-size: 0.75rem; cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em; }
    .btn:hover { opacity: 0.9; }
    @keyframes pop { 0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } }
  </style>
</head>
<body>
  <div id="toast" class="toast">Not in word list!</div>
  <div class="game-card">
    <h1>COREZ WORDLE</h1>
    <p class="subtitle">Guess the 5-letter hidden word in 6 tries</p>
    <div class="grid" id="grid"></div>
    <div class="keyboard" id="keyboard"></div>
    <div class="controls">
      <button class="btn" id="resetBtn">New Word</button>
    </div>
  </div>
  <script>
    const WORDS = [
      "APPLE","BRAIN","SMART","COREZ","FLASH","REACT","PLANT","TRAIN","WATER","DREAM",
      "SHINE","CLOCK","FLAME","STORM","CLIMB","SOUND","MUSIC","LIGHT","GREAT","WORLD",
      "POWER","CLEAN","CLEAR","CLOUDS","SPACE","CRAFT","AGENT","BOARD","CHECK","FRAME",
      "GUIDE","HOUSE","IMAGE","JUICE","KNIFE","LEMON","MAGIC","NIGHT","OCEAN","PAPER",
      "QUEEN","RIVER","SOLAR","TABLE","UNION","VALUE","WHITE","YOUTH","ZEBRA","BLOCK",
      "CANDY","DRIVE","EARTH","FIELD","GLASS","HEART","INDEX","JUDGE","LOGIC","MONEY",
      "NOBLE","ORDER","PHASE","RADIO","STAGE","TRACK","VOICE","YIELD","APEX","BLINK"
    ];
    const DICTIONARY = new Set([
      ...WORDS,
      "ABOUT","ABOVE","ABUSE","ACTOR","ACUTE","ADMIT","ADOPT","ADULT","AFTER","AGAIN",
      "AGENT","AGREE","AHEAD","ALARM","ALBUM","ALERT","ALIKE","ALIVE","ALLOW","ALONE",
      "ALONG","ALTER","AMONG","ANGER","ANGLE","ANGRY","APART","APPLE","APPLY","ARENA",
      "ARGUE","ARISE","ARRAY","ASIDE","ASSET","AUDIO","AUDIT","AVOID","AWARD","AWARE",
      "BADLY","BAKER","BASES","BASIC","BASIS","BEACH","BEGIN","BEING","BELOW","BENCH",
      "BLACK","BLANK","BLIND","BLOCK","BLOOD","BOARD","BOAST","BOOST","BOUND","BRAIN",
      "BRAND","BREAD","BREAK","BRICK","BRIEF","BRING","BROAD","BROWN","BUILD","BUILT",
      "BUYER","CABLE","CALIF","CARRY","CATCH","CAUSE","CHAIN","CHAIR","CHAOS","CHARM",
      "CHART","CHASE","CHEAP","CHECK","CHEST","CHIEF","CHILD","CHINA","CHOSE","CIVIL",
      "CLAIM","CLASS","CLEAN","CLEAR","CLICK","CLOCK","CLOSE","COACH","COAST","COLOR",
      "COUNT","COURT","COVER","CRAFT","CRASH","CREAM","CRIME","CROSS","CROWD","CROWN",
      "CYCLE","DAILY","DANCE","DATED","DEATH","DEBUT","DELAY","DEPTH","DIRTY","DOUBT",
      "DRAFT","DRAMA","DREAM","DRESS","DRIVE","EARTH","EIGHT","EMPTY","ENEMY","ENTRY",
      "EQUAL","ERROR","EVENT","EVERY","EXACT","EXIST","FAITH","FALSE","FAULT","FIBER",
      "FIELD","FIFTH","FIFTY","FINAL","FIRST","FIXED","FLASH","FLEET","FLOOR","FLUID",
      "FOCUS","FORCE","FORTH","FORTY","FORUM","FOUND","FRAME","FRANK","FRAUD","FRESH",
      "FRONT","FRUIT","FULLY","FUNNY","GIANT","GIVEN","GLASS","GLOBE","GOING","GRACE",
      "GRADE","GRAND","GRANT","GRASS","GREAT","GREEN","GROSS","GROUP","GROWN","GUARD",
      "GUESS","GUEST","GUIDE","HAPPY","HEART","HEAVY","HELLO","IMAGE","INDEX","INPUT",
      "ISSUE","JAPAN","JUDGE","KNIFE","LABEL","LABOR","LARGE","LATER","LATIN","LAYER",
      "LEARN","LEASE","LEAST","LEAVE","LEGAL","LEVEL","LIGHT","LIMIT","LOCAL","LOGIC",
      "LOOSE","LOWER","LUCKY","MAGIC","MAJOR","MAKER","MARCH","MATCH","MAYBE","MEDAL",
      "MEDIA","METAL","MICRO","MIGHT","MINOR","MINUS","MODEL","MONEY","MONTH","MORAL",
      "MOTOR","MOUNT","MOUSE","MOUTH","MOVIE","MUSIC","NEEDS","NEVER","NIGHT","NOISE",
      "NORTH","NOTED","NOVEL","NURSE","OCCUR","OCEAN","OFFER","OFTEN","ORDER","OTHER",
      "OUGHT","PAINT","PANEL","PAPER","PARTY","PEACE","PETER","PHASE","PHONE","PHOTO",
      "PIECE","PILOT","PITCH","PLACE","PLAIN","PLANE","PLANT","PLATE","POINT","POUND",
      "POWER","PRESS","PRICE","PRIDE","PRIME","PRINT","PRIOR","PROOF","PROUD","PROVE",
      "QUEEN","QUICK","QUIET","QUITE","RADIO","RAISE","RANGE","RAPID","RATIO","REACH",
      "READY","REFER","RIGHT","RIVAL","RIVER","ROBIN","ROGER","ROMAN","ROUGH","ROUND",
      "ROUTE","ROYAL","SCALE","SCENE","SCOPE","SCORE","SENSE","SERVE","SEVEN","SHALL",
      "SHAPE","SHARE","SHARP","SHEET","SHELF","SHELL","SHIFT","SHINE","SHIRT","SHOCK",
      "SHOOT","SHORT","SHOWN","SIGHT","SINCE","SIXTH","SIXTY","SIZED","SKILL","SLEEP",
      "SLIDE","SMALL","SMART","SMILE","SMITH","SMOKE","SOLID","SOLVE","SORRY","SOUND",
      "SOUTH","SPACE","SPARE","SPEAK","SPEED","SPEND","SPENT","SPLIT","SPOKE","SPORT",
      "STAFF","STAGE","STAKE","STAND","START","STATE","STEAM","STEEL","STICK","STILL",
      "STOCK","STONE","STOOD","STORE","STORM","STORY","STRIP","STUCK","STUDY","STUFF",
      "STYLE","SUGAR","SUITE","SUPER","TABLE","TAKEN","TASTE","TAXES","TEACH","TEETH",
      "TEXAS","THANK","THEFT","THEIR","THEME","THERE","THESE","THICK","THING","THINK",
      "THIRD","THOSE","THREE","THREW","THROW","TIGHT","TIMES","TIRED","TITLE","TODAY",
      "TOPIC","TOTAL","TOUCH","TOUGH","TOWER","TRACK","TRADE","TRAIN","TREAT","TREND",
      "TRIAL","TRIED","TRIES","TRUCK","TRULY","TRUST","TRUTH","TWICE","UNDER","UNDUE",
      "UNION","UNITY","UNTIL","UPPER","UPSET","URBAN","USAGE","USUAL","VALID","VALUE",
      "VIDEO","VIRUS","VISIT","VITAL","VOICE","WASTE","WATCH","WATER","WHEEL","WHERE",
      "WHICH","WHILE","WHITE","WHOLE","WHOSE","WOMAN","WOMEN","WORLD","WORRY","WORSE",
      "WORST","WORTH","WOULD","WOUND","WRITE","WRONG","WROTE","YOUTH"
    ]);

    let target = "", currentRow = 0, currentTile = 0, gameOver = false;
    let guesses = Array(6).fill("");
    const keyStates = {};

    function init() {
      target = WORDS[Math.floor(Math.random() * WORDS.length)];
      currentRow = 0; currentTile = 0; gameOver = false;
      guesses = Array(6).fill("");
      for (let k in keyStates) delete keyStates[k];
      renderGrid();
      renderKeyboard();
    }

    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2000);
    }

    function renderGrid() {
      const g = document.getElementById('grid');
      g.innerHTML = '';
      for (let r = 0; r < 6; r++) {
        const row = document.createElement('div');
        row.className = 'row';
        for (let c = 0; c < 5; c++) {
          const tile = document.createElement('div');
          tile.className = 'tile';
          const ch = guesses[r] ? guesses[r][c] || '' : '';
          tile.textContent = ch;
          if (ch) tile.classList.add('filled');
          if (r < currentRow) {
            const evalState = evaluateTile(guesses[r], c);
            tile.classList.add(evalState);
          }
          row.appendChild(tile);
        }
        g.appendChild(row);
      }
    }

    function evaluateTile(word, idx) {
      if (!word) return '';
      const ch = word[idx];
      if (target[idx] === ch) return 'correct';
      if (target.includes(ch)) return 'present';
      return 'absent';
    }

    function renderKeyboard() {
      const kb = document.getElementById('keyboard');
      kb.innerHTML = '';
      const layout = [
        ["Q","W","E","R","T","Y","U","I","O","P"],
        ["A","S","D","F","G","H","J","K","L"],
        ["ENTER","Z","X","C","V","B","N","M","BACK"]
      ];

      layout.forEach(r => {
        const row = document.createElement('div');
        row.className = 'kb-row';
        r.forEach(k => {
          const btn = document.createElement('button');
          btn.className = 'key' + (k.length > 1 ? ' wide' : '');
          btn.textContent = k === 'BACK' ? '⌫' : k;
          if (keyStates[k]) btn.classList.add(keyStates[k]);
          btn.onclick = () => handleInput(k);
          row.appendChild(btn);
        });
        kb.appendChild(row);
      });
    }

    function handleInput(key) {
      if (gameOver) return;
      if (key === 'ENTER') {
        if (currentTile < 5) {
          showToast('Not enough letters');
          return;
        }
        const guess = guesses[currentRow];
        if (!DICTIONARY.has(guess)) {
          showToast('Not in word list!');
          return;
        }
        
        for (let i = 0; i < 5; i++) {
          const ch = guess[i];
          const st = evaluateTile(guess, i);
          if (st === 'correct' || (st === 'present' && keyStates[ch] !== 'correct') || (!keyStates[ch] && st === 'absent')) {
            keyStates[ch] = st;
          }
        }

        currentRow++;
        currentTile = 0;
        renderGrid();
        renderKeyboard();

        if (guess === target) {
          gameOver = true;
          setTimeout(() => alert('🎉 Outstanding! You solved it in ' + currentRow + ' tries!'), 300);
        } else if (currentRow === 6) {
          gameOver = true;
          setTimeout(() => alert('Game Over! The target word was: ' + target), 300);
        }
      } else if (key === 'BACK' || key === 'BACKSPACE') {
        if (currentTile > 0) {
          currentTile--;
          guesses[currentRow] = guesses[currentRow].slice(0, currentTile);
          renderGrid();
        }
      } else if (/^[A-Z]$/.test(key)) {
        if (currentTile < 5) {
          guesses[currentRow] += key;
          currentTile++;
          renderGrid();
        }
      }
    }

    document.addEventListener('keydown', e => {
      const k = e.key.toUpperCase();
      if (k === 'ENTER' || k === 'BACKSPACE' || /^[A-Z]$/.test(k)) {
        handleInput(k);
      }
    });

    document.getElementById('resetBtn').onclick = init;
    init();
  <\/script>
</body>
</html>`}function L6(){return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>COREZ Scrabble Master</title>
  <style>
    :root {
      --bg: #09090b;
      --card: #121215;
      --border: #27272a;
      --text: #f4f4f5;
      --text-muted: #a1a1aa;
      --tile-bg: #eab308;
      --tile-text: #000000;
      --tw: #ef4444;
      --dw: #ec4899;
      --tl: #3b82f6;
      --dl: #38bdf8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1rem; }
    .game-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1rem; width: 100%; max-width: 480px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
    h1 { font-size: 1.25rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 0.5rem; color: #fff; }
    .status-bar { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.8rem; background: rgba(255,255,255,0.03); border-radius: 6px; border: 1px solid var(--border); margin-bottom: 0.75rem; font-size: 0.85rem; }
    .score-badge { font-weight: 700; color: #eab308; }
    .board { display: grid; grid-template-columns: repeat(11, 1fr); grid-template-rows: repeat(11, 1fr); gap: 2px; aspect-ratio: 1; background: #18181b; border: 2px solid var(--border); border-radius: 6px; padding: 4px; margin-bottom: 0.75rem; }
    .sq { background: #27272a; border-radius: 2px; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 700; cursor: pointer; user-select: none; position: relative; color: #71717a; text-transform: uppercase; }
    .sq.tw { background: var(--tw); color: #fff; }
    .sq.dw { background: var(--dw); color: #fff; }
    .sq.tl { background: var(--tl); color: #fff; }
    .sq.dl { background: var(--dl); color: #fff; }
    .sq.center { background: #eab308; color: #000; }
    .tile { width: 90%; height: 90%; background: var(--tile-bg); color: var(--tile-text); border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; font-weight: 800; position: relative; box-shadow: 0 2px 4px rgba(0,0,0,0.3); }
    .tile-sub { position: absolute; bottom: 1px; right: 2px; font-size: 0.55rem; font-weight: 700; }
    .tile.unsubmitted { outline: 2px solid #ffffff; animation: pulse 1s infinite alternate; }
    .rack-container { background: #18181b; border: 1px solid var(--border); border-radius: 8px; padding: 0.6rem; margin-bottom: 0.75rem; }
    .rack-label { font-size: 0.7rem; color: var(--text-muted); margin-bottom: 0.4rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .rack-tiles { display: flex; justify-content: center; gap: 6px; min-height: 42px; }
    .rack-tile { width: 38px; height: 38px; background: var(--tile-bg); color: var(--tile-text); border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 1rem; font-weight: 800; cursor: pointer; user-select: none; position: relative; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transition: transform 0.15s ease; }
    .rack-tile:hover { transform: translateY(-2px); }
    .rack-tile.selected { outline: 3px solid #6366f1; transform: translateY(-4px); }
    .controls { display: flex; gap: 0.4rem; justify-content: center; flex-wrap: wrap; }
    .btn { background: #fff; color: #000; border: none; padding: 0.55rem 1rem; border-radius: 6px; font-weight: 700; font-size: 0.75rem; cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em; }
    .btn:hover { opacity: 0.9; }
    .btn-sec { background: transparent; color: var(--text); border: 1px solid var(--border); }
    .btn-sec:hover { background: rgba(255,255,255,0.05); }
    @keyframes pulse { from { opacity: 0.85; } to { opacity: 1; } }
  </style>
</head>
<body>
  <div class="game-card">
    <h1>COREZ SCRABBLE</h1>
    <div class="status-bar">
      <span>Score: <span id="score" class="score-badge">0</span></span>
      <span>Tiles Left: <span id="bagCount" class="score-badge">80</span></span>
    </div>
    <div class="board" id="board"></div>
    <div class="rack-container">
      <div class="rack-label">Your Tile Rack (Click tile to select, then click board square)</div>
      <div class="rack-tiles" id="rack"></div>
    </div>
    <div class="controls">
      <button class="btn" id="submitBtn">Play Turn</button>
      <button class="btn btn-sec" id="recallBtn">Recall</button>
      <button class="btn btn-sec" id="shuffleBtn">Shuffle</button>
      <button class="btn btn-sec" id="resetBtn">New Game</button>
    </div>
  </div>
  <script>
    const POINTS = { A:1, B:3, C:3, D:2, E:1, F:4, G:2, H:4, I:1, J:8, K:5, L:1, M:3, N:1, O:1, P:3, Q:10, R:1, S:1, T:1, U:1, V:4, W:4, X:8, Y:4, Z:10 };
    
    const DICTIONARY = new Set([
      "AN","AT","BE","BY","DO","GO","HE","IN","IS","IT","ME","MY","NO","ON","OR","SO","TO","UP","WE",
      "ACT","ADD","AGE","AIR","AND","ANY","ART","BAD","BAG","BED","BIG","BOX","BOY","BUS","BUT","CAN","CAT","CAR","DAY","DOG","DRY","EAR","EAT","EGG","END","EYE","FAR","FLY","FOR","GET","GOD","GUN","HAT","HOT","ICE","JOB","KEY","KID","LAW","LEG","LET","LOW","MAN","MAP","NEW","NOT","NOW","OFF","OLD","ONE","OUR","OUT","PAY","PEN","PER","PET","PIN","POP","PUT","RED","RUN","SEA","SEE","SET","SIX","SUN","TAX","TEN","THE","TOP","TOY","TRY","TWO","USE","WAR","WAY","WIN","YES","YOU","ZOO",
      "ABLE","ACID","AGED","ALSO","AREA","ARMY","BABY","BACK","BALL","BAND","BANK","BASE","BATH","BEAR","BEAT","BELL","BEST","BIRD","BLOW","BLUE","BOAT","BODY","BOMB","BOND","BONE","BOOK","BOOM","BORN","BOSS","BOTH","BOWL","BULK","BURN","BUSH","BUSY","CALL","CALM","CAME","CAMP","CARD","CARE","CASE","CASH","CELL","CHAT","CHEF","CITY","CLUB","COAL","COAT","CODE","COLD","CORE","COST","DARK","DATA","DATE","DAWN","DEAD","DEAL","DEAR","DEBT","DEEP","DESK","DIET","DISK","DOOR","DOWN","DRAW","DROP","DUST","DUTY","EACH","EARN","EAST","EASY","EDGE","ELSE","EVEN","EVER","FACE","FACT","FAIR","FALL","FARM","FAST","FEAR","FEED","FEEL","FEET","FILE","FILL","FILM","FIND","FINE","FIRE","FIRM","FISH","FLAT","FLOW","FOOD","FOOT","FORD","FORM","FORT","FREE","FROM","FUEL","FULL","FUND","GAME","GIFT","GIRL","GIVE","GLAD","GOAL","GOLD","GOOD","GROW","GOLF","HALF","HAND","HARD","HARM","HEAD","HEAR","HEAT","HELL","HELP","HIGH","HOLD","HOLE","HOME","HOPE","HUGE","IDEA","INTO","ITEM","JOIN","JUMP","JUST","KEEP","KIND","KING","KNEW","KNOW","LACK","LADY","LAND","LANE","LAST","LATE","LEAD","LEFT","LESS","LIFE","LIFT","LIKE","LINE","LINK","LION","LIST","LIVE","LOAD","LOAN","LOCK","LOGO","LONG","LOOK","LORD","LOSS","LOVE","LUCK","MADE","MAIL","MAIN","MAKE","MALE","MANY","MARK","MASS","MEAL","MEAN","MEAT","MEET","MIND","MINE","MODE","MOON","MORE","MOST","MOVE","MUCH","NAME","NAVY","NEAR","NECK","NEED","NEWS","NEXT","NICE","NIGHT","NODE","NONE","NOSE","NOTE","OKAY","ONCE","ONLY","OPEN","OVER","PACE","PACK","PAGE","PAIN","PAIR","PARK","PART","PASS","PATH","PEAK","PLAN","PLAY","PLUS","POEM","POET","POLE","POOL","POOR","PORT","POST","PULL","PURE","PUSH","RACE","RAIL","RAIN","RANK","RARE","RATE","READ","REAL","RELY","REST","RICE","RICH","RIDE","RING","RISE","RISK","ROAD","ROCK","ROLE","ROLL","ROOF","ROOM","ROOT","ROSE","RULE","RUSH","SAFE","SAID","SAIL","SALE","SAME","SAVE","SEAT","SEED","SEEK","SEEM","SEEN","SELF","SELL","SEND","SHIP","SHOE","SHOP","SHOT","SHOW","SIDE","SIGN","SITE","SIZE","SKIN","SLIP","SLOW","SNOW","SOFT","SOIL","SOLD","SOLE","SOME","SONG","SOON","SORT","SOUL","SPOT","STAR","STAY","STEP","STOP","SUCH","SUIT","SURE","TAKE","TALK","TALL","TASK","TEAM","TEAR","TECH","TELL","TERM","TEST","TEXT","THAT","THEM","THEN","THIS","THUS","TIDE","TIME","TINY","TOLL","TONE","TOOK","TOOL","TOWN","TREE","TRIP","TRUE","TUBE","TURN","TYPE","UNIT","UPON","USER","VARY","VERY","VIEW","VOTE","WAGE","WAIT","WALK","WALL","WANT","WARM","WASH","WAVE","WAYS","WEAR","WEEK","WELL","WEST","WHAT","WHEN","WHICH","WIDE","WIFE","WILD","WILL","WIND","WINE","WING","WIRE","WISH","WITH","WOOD","WORD","WORK","YARD","YEAR","ZERO","ZONE",
      "ABOUT","ABOVE","ACCEPT","ACTION","ACTIVE","ACTUAL","ADVICE","AFFORD","AFRAID","AGENDA","AGREE","ALMOST","ALWAYS","ANIMAL","ANSWER","ANYONE","APPEAR","AUTHOR","BAKERY","BEAUTY","BEFORE","BEHIND","BETTER","BEYOND","BORDER","BOTTLE","BRANCH","BRIDGE","BRIGHT","BUDGET","CAMERA","CANCEL","CANDLE","CANYON","CAPTAIN","CARBON","CAREER","CASTLE","CEMENT","CENTER","CHANCE","CHANGE","CHARGE","CHEESE","CHOICE","CHURCH","CIRCLE","CLIENT","CHOICE","CLEVER","CLIENT","CLIMATE","COFFEE","COLLEGE","COMMON","CANDLE","COOKIE","COPPER","CORNER","COUSIN","CREDIT","CUSTOM","DAMAGE","DANGER","DEGREE","DESIGN","DESIRE","DETAIL","DEVICE","DIRECT","DOCTOR","DOMAIN","DRAGON","DRIVER","DURING","ENGINE","ENOUGH","ESCAPE","ESTATE","EXPERT","FAMILY","FARMER","FEATHER","FEMALE","FINGER","FLIGHT","FLOWER","FOREST","FORGET","FRIEND","FUTURE","GARDEN","GARLIC","GENIUS","GENTLE","GLOBAL","GOLDEN","HANDLE","HAPPINESS","HARBOR","HEALTH","HEAVEN","HEIGHT","HEROIC","HISTORY","HONEST","HONEY","HUNTER","IMPACT","ISLAND","JACKET","JOURNEY","JUNGLE","JUNIOR","KITCHEN","LADDER","LAWYER","LEADER","LEGEND","LESSON","LETTER","LIQUID","LISTEN","LITTLE","LIVING","LIZARD","LONELY","MAGNET","MAGIC","MANAGEMENT","MANUAL","MARKET","MASTER","MEMORY","MENTOR","METHOD","MIRROR","MODERN","MOMENT","MONKEY","MOTHER","MOUNTAIN","MUSEUM","NATURE","NEIGHBOR","NETWORK","NORMAL","NOTICE","NUMBER","OFFICE","ONLINE","ORANGE","ORIGIN","OXYGEN","PACKET","PALACE","PARNER","PATIENT","PATTERN","PEOPLE","PEPPER","PERSON","PLANET","PLAYER","POLICE","PORTRAIT","POSTAL","POWDER","POWERFUL","PRECIOUS","PREFIX","PRETTY","PRINCE","PRISON","PROFIT","PROMPT","PROPERTY","PROTECT","PUBLIC","PUPIL","PURPLE","PUZZLE","QUALITY","QUARTER","RABBIT","RANDOM","READER","REASON","RECORD","REGION","RESCUE","RESORT","RESULT","REWARD","RIVER","ROCKET","RUNNER","SAFETY","SALAD","SALMON","SAMPLE","SATURN","SAVING","SCHOOL","SCREEN","SEASON","SECOND","SECRET","SECTOR","SENIOR","SHADOW","SILVER","SIMPLE","SINGLE","SISTER","SOCKET","SILENT","SILVER","SKETCH","SLIDER","SMART","SOCKET","SOCKET","SOURCE","SPEAKER","SPIRIT","SPRING","SQUARE","STATION","STATUS","STREAM","STREET","STRONG","STUDENT","SUMMER","SUNDAY","SUPER","SUPPER","SWITCH","SYMBOL","SYSTEM","TARGET","TEMPLE","TENNIS","TERROR","THEORY","THICKET","TICKET","TIMBER","TOGETHER","TOMATO","TONIGHT","TOPIC","TOTAL","TOWARD","TRAVEL","TUNNEL","TURTLE","TWELVE","TWENTY","UNDER","UNIQUE","UPDATE","UPGRADE","VACUUM","VALLEY","VECTOR","VELVET","VICTORY","VILLAGE","VIRTUE","VISION","VOLUME","WALKER","WARNING","WEAPON","WEATHER","WEEKEND","WINNER","WINTER","WISDOM","WORKER","YELLOW"
    ]);

    const BOARD_SIZE = 11;
    let board = [], rack = [], bag = [], score = 0, selectedRackIdx = null, unsubmittedTiles = [];

    function getSquareType(r, c) {
      if (r === 5 && c === 5) return 'center';
      if ((r === 0 || r === 10) && (c === 0 || c === 10)) return 'tw';
      if ((r === 2 || r === 8) && (c === 2 || c === 8)) return 'dw';
      if ((r === 1 || r === 9) && (c === 5 || r === 5 && (c === 1 || c === 9))) return 'tl';
      if ((r === 3 || r === 7) && (c === 3 || c === 7)) return 'dl';
      return '';
    }

    function initBag() {
      bag = [];
      const distribution = { A:9, B:2, C:2, D:4, E:12, F:2, G:3, H:2, I:9, J:1, K:1, L:4, M:2, N:6, O:8, P:2, Q:1, R:6, S:4, T:6, U:4, V:2, W:2, X:1, Y:2, Z:1 };
      for (let char in distribution) {
        for (let i = 0; i < distribution[char]; i++) bag.push(char);
      }
      bag.sort(() => Math.random() - 0.5);
    }

    function drawTiles(count) {
      const drawn = [];
      while (drawn.length < count && bag.length > 0) {
        drawn.push(bag.pop());
      }
      return drawn;
    }

    function init() {
      initBag();
      score = 0;
      unsubmittedTiles = [];
      selectedRackIdx = null;
      board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
      rack = drawTiles(7);
      render();
    }

    function render() {
      document.getElementById('score').textContent = score;
      document.getElementById('bagCount').textContent = bag.length;

      const bEl = document.getElementById('board');
      bEl.innerHTML = '';
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          const sq = document.createElement('div');
          const sqType = getSquareType(r, c);
          sq.className = 'sq ' + sqType;
          
          const cell = board[r][c];
          if (cell) {
            const tile = document.createElement('div');
            tile.className = 'tile' + (cell.unsubmitted ? ' unsubmitted' : '');
            tile.innerHTML = cell.char + '<span class="tile-sub">' + POINTS[cell.char] + '</span>';
            sq.appendChild(tile);
          } else if (sqType) {
            sq.textContent = sqType.toUpperCase();
          }

          sq.onclick = () => onSquareClick(r, c);
          bEl.appendChild(sq);
        }
      }

      const rEl = document.getElementById('rack');
      rEl.innerHTML = '';
      rack.forEach((char, idx) => {
        const t = document.createElement('div');
        t.className = 'rack-tile' + (selectedRackIdx === idx ? ' selected' : '');
        t.innerHTML = char + '<span class="tile-sub">' + POINTS[char] + '</span>';
        t.onclick = () => {
          selectedRackIdx = selectedRackIdx === idx ? null : idx;
          render();
        };
        rEl.appendChild(t);
      });
    }

    function onSquareClick(r, c) {
      const cell = board[r][c];
      if (cell && cell.unsubmitted) {
        rack.push(cell.char);
        board[r][c] = null;
        unsubmittedTiles = unsubmittedTiles.filter(t => !(t.r === r && t.c === c));
        render();
        return;
      }

      if (!cell && selectedRackIdx !== null) {
        const char = rack[selectedRackIdx];
        rack.splice(selectedRackIdx, 1);
        selectedRackIdx = null;
        board[r][c] = { char, unsubmitted: true };
        unsubmittedTiles.push({ r, c, char });
        render();
      }
    }

    function recallUnsubmitted() {
      unsubmittedTiles.forEach(t => {
        rack.push(t.char);
        board[t.r][t.c] = null;
      });
      unsubmittedTiles = [];
      selectedRackIdx = null;
      render();
    }

    function submitTurn() {
      if (unsubmittedTiles.length === 0) {
        alert('Place at least 1 tile on the board to play your turn.');
        return;
      }

      const rows = new Set(unsubmittedTiles.map(t => t.r));
      const cols = new Set(unsubmittedTiles.map(t => t.c));
      if (rows.size > 1 && cols.size > 1) {
        alert('Tiles must be placed in a single straight row or column.');
        return;
      }

      const wordsFormed = [];
      
      function getHorizontalWord(r, c) {
        let startC = c;
        while (startC > 0 && board[r][startC - 1]) startC--;
        let endC = c;
        while (endC < BOARD_SIZE - 1 && board[r][endC + 1]) endC++;
        if (startC === endC) return null;
        let word = "", scoreMult = 1, wordPoints = 0;
        for (let i = startC; i <= endC; i++) {
          const cell = board[r][i];
          let p = POINTS[cell.char];
          if (cell.unsubmitted) {
            const type = getSquareType(r, i);
            if (type === 'dl') p *= 2;
            if (type === 'tl') p *= 3;
            if (type === 'dw') scoreMult *= 2;
            if (type === 'tw') scoreMult *= 3;
          }
          wordPoints += p;
          word += cell.char;
        }
        return { word, points: wordPoints * scoreMult };
      }

      function getVerticalWord(r, c) {
        let startR = r;
        while (startR > 0 && board[startR - 1][c]) startR--;
        let endR = r;
        while (endR < BOARD_SIZE - 1 && board[endR + 1][c]) endR++;
        if (startR === endR) return null;
        let word = "", scoreMult = 1, wordPoints = 0;
        for (let i = startR; i <= endR; i++) {
          const cell = board[i][c];
          let p = POINTS[cell.char];
          if (cell.unsubmitted) {
            const type = getSquareType(i, c);
            if (type === 'dl') p *= 2;
            if (type === 'tl') p *= 3;
            if (type === 'dw') scoreMult *= 2;
            if (type === 'tw') scoreMult *= 3;
          }
          wordPoints += p;
          word += cell.char;
        }
        return { word, points: wordPoints * scoreMult };
      }

      const testedWords = new Set();
      let turnScore = 0;

      unsubmittedTiles.forEach(t => {
        const h = getHorizontalWord(t.r, t.c);
        if (h && !testedWords.has(h.word)) {
          testedWords.add(h.word);
          wordsFormed.push(h);
        }
        const v = getVerticalWord(t.r, t.c);
        if (v && !testedWords.has(v.word)) {
          testedWords.add(v.word);
          wordsFormed.push(v);
        }
      });

      if (wordsFormed.length === 0) {
        alert('Your tile must connect with other letters to form a word.');
        return;
      }

      const invalid = wordsFormed.filter(w => !DICTIONARY.has(w.word));
      if (invalid.length > 0) {
        alert('Invalid word: "' + invalid[0].word + '" is not in the dictionary!');
        recallUnsubmitted();
        return;
      }

      wordsFormed.forEach(w => turnScore += w.points);

      unsubmittedTiles.forEach(t => {
        if (board[t.r][t.c]) delete board[t.r][t.c].unsubmitted;
      });

      score += turnScore;
      unsubmittedTiles = [];

      const needed = 7 - rack.length;
      if (needed > 0) {
        const drawn = drawTiles(needed);
        rack.push(...drawn);
      }

      render();
      alert('Success! Word accepted! +' + turnScore + ' points.');
    }

    document.getElementById('submitBtn').onclick = submitTurn;
    document.getElementById('recallBtn').onclick = recallUnsubmitted;
    document.getElementById('shuffleBtn').onclick = () => { rack.sort(() => Math.random() - 0.5); render(); };
    document.getElementById('resetBtn').onclick = init;

    init();
  <\/script>
</body>
</html>`}function Vu(){return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>COREZ Super Mario Platformer</title>
  <style>
    :root {
      --bg: #09090b;
      --card: #121215;
      --border: #27272a;
      --text: #f4f4f5;
      --gold: #eab308;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1rem; }
    .game-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; width: 100%; max-width: 560px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
    h1 { font-size: 1.25rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 0.5rem; color: #fff; }
    .status-bar { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.8rem; background: rgba(255,255,255,0.03); border-radius: 6px; border: 1px solid var(--border); margin-bottom: 0.75rem; font-size: 0.85rem; font-family: monospace; }
    .badge { color: var(--gold); font-weight: 700; }
    canvas { background: #5c94fc; border: 2px solid var(--border); border-radius: 6px; display: block; margin: 0 auto 0.75rem auto; width: 100%; aspect-ratio: 1.6; image-rendering: pixelated; }
    .controls-hint { font-size: 0.75rem; color: #a1a1aa; margin-bottom: 0.75rem; }
    .btn-bar { display: flex; gap: 0.5rem; justify-content: center; }
    .btn { background: #fff; color: #000; border: none; padding: 0.6rem 1.2rem; border-radius: 6px; font-weight: 700; font-size: 0.75rem; cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em; }
    .btn:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="game-card">
    <h1>SUPER MARIO WORLD</h1>
    <div class="status-bar">
      <span>SCORE: <span id="scoreText" class="badge">0</span></span>
      <span>COINS: <span id="coinText" class="badge">🪙 0</span></span>
      <span>LIVES: <span id="livesText" class="badge">❤️ 3</span></span>
    </div>
    <canvas id="c" width="512" height="320"></canvas>
    <div class="controls-hint">Controls: <b>A / D / Arrow Keys</b> to Move • <b>Space / W / Up Arrow</b> to Jump</div>
    <div class="btn-bar">
      <button class="btn" id="restartBtn">Play Again</button>
    </div>
  </div>
  <script>
    const canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
    let state = { score: 0, coins: 0, lives: 3, gameOver: false, won: false, cameraX: 0 };
    let keys = {};
    window.addEventListener('keydown', e => { keys[e.key] = true; });
    window.addEventListener('keyup', e => { keys[e.key] = false; });

    let player = { x: 40, y: 200, w: 18, h: 26, vx: 0, vy: 0, grounded: false, facing: 'right' };
    let platforms = [
      { x: 0, y: 280, w: 750, h: 40, type: 'ground' },
      { x: 820, y: 280, w: 800, h: 40, type: 'ground' },
      { x: 140, y: 200, w: 24, h: 24, type: 'block' },
      { x: 180, y: 200, w: 24, h: 24, type: 'question', hit: false },
      { x: 204, y: 200, w: 24, h: 24, type: 'block' },
      { x: 228, y: 200, w: 24, h: 24, type: 'question', hit: false },
      { x: 252, y: 200, w: 24, h: 24, type: 'block' },
      { x: 340, y: 232, w: 36, h: 48, type: 'pipe' },
      { x: 460, y: 212, w: 36, h: 68, type: 'pipe' },
      { x: 560, y: 160, w: 96, h: 20, type: 'block' },
      { x: 610, y: 100, w: 24, h: 24, type: 'question', hit: false },
      { x: 860, y: 200, w: 120, h: 20, type: 'block' },
      { x: 1100, y: 256, w: 24, h: 24, type: 'stair' },
      { x: 1124, y: 232, w: 24, h: 48, type: 'stair' },
      { x: 1148, y: 208, w: 24, h: 72, type: 'stair' },
      { x: 1172, y: 184, w: 24, h: 96, type: 'stair' }
    ];

    let coins = [
      { x: 184, y: 160, taken: false },
      { x: 232, y: 160, taken: false },
      { x: 580, y: 130, taken: false },
      { x: 600, y: 130, taken: false },
      { x: 620, y: 130, taken: false },
      { x: 880, y: 170, taken: false },
      { x: 910, y: 170, taken: false }
    ];

    let enemies = [
      { x: 280, y: 258, w: 20, h: 22, vx: -1, alive: true },
      { x: 500, y: 258, w: 20, h: 22, vx: -1.2, alive: true },
      { x: 900, y: 178, w: 20, h: 22, vx: -1, alive: true },
      { x: 1000, y: 258, w: 20, h: 22, vx: -1.5, alive: true }
    ];

    let flagpole = { x: 1240, y: 100, w: 8, h: 180 };

    function resetGame() {
      state = { score: 0, coins: 0, lives: 3, gameOver: false, won: false, cameraX: 0 };
      player = { x: 40, y: 200, w: 18, h: 26, vx: 0, vy: 0, grounded: false, facing: 'right' };
      platforms.forEach(p => p.hit = false);
      coins.forEach(c => c.taken = false);
      enemies.forEach((e, i) => { e.alive = true; e.x = 280 + i * 240; e.vx = -1; });
      updateUI();
    }

    function updateUI() {
      document.getElementById('scoreText').textContent = state.score;
      document.getElementById('coinText').textContent = '🪙 ' + state.coins;
      document.getElementById('livesText').textContent = '❤️ ' + state.lives;
    }

    function update() {
      if (state.gameOver || state.won) return;

      if (keys['ArrowLeft'] || keys['a'] || keys['A']) { player.vx = -3.2; player.facing = 'left'; }
      else if (keys['ArrowRight'] || keys['d'] || keys['D']) { player.vx = 3.2; player.facing = 'right'; }
      else { player.vx *= 0.7; }

      if ((keys['ArrowUp'] || keys['w'] || keys['W'] || keys[' ']) && player.grounded) {
        player.vy = -10.5; player.grounded = false;
      }

      player.vy += 0.55; player.x += player.vx;
      platforms.forEach(p => {
        if (player.x < p.x + p.w && player.x + player.w > p.x && player.y < p.y + p.h && player.y + player.h > p.y) {
          if (player.vx > 0) player.x = p.x - player.w;
          else if (player.vx < 0) player.x = p.x + p.w;
        }
      });

      player.y += player.vy; player.grounded = false;
      platforms.forEach(p => {
        if (player.x < p.x + p.w && player.x + player.w > p.x && player.y < p.y + p.h && player.y + player.h > p.y) {
          if (player.vy > 0) { player.y = p.y - player.h; player.vy = 0; player.grounded = true; }
          else if (player.vy < 0) {
            player.y = p.y + p.h; player.vy = 0;
            if (p.type === 'question' && !p.hit) { p.hit = true; state.coins++; state.score += 100; updateUI(); }
          }
        }
      });

      if (player.y > 340) {
        state.lives--; updateUI();
        if (state.lives <= 0) { state.gameOver = true; }
        else { player.x = Math.max(40, state.cameraX + 20); player.y = 100; player.vy = 0; }
      }

      coins.forEach(c => {
        if (!c.taken && Math.hypot(player.x + 9 - c.x, player.y + 13 - c.y) < 18) {
          c.taken = true; state.coins++; state.score += 100; updateUI();
        }
      });

      enemies.forEach(e => {
        if (!e.alive) return;
        e.x += e.vx;
        if (e.x < 100 || e.x > 1150) e.vx *= -1;

        if (player.x < e.x + e.w && player.x + player.w > e.x && player.y < e.y + e.h && player.y + player.h > e.y) {
          if (player.vy > 0 && player.y + player.h - player.vy <= e.y + 8) {
            e.alive = false; player.vy = -7; state.score += 200; updateUI();
          } else {
            state.lives--; updateUI();
            if (state.lives <= 0) { state.gameOver = true; }
            else { player.x = Math.max(40, state.cameraX + 20); player.y = 100; player.vy = 0; }
          }
        }
      });

      if (player.x >= flagpole.x) { state.won = true; state.score += 1000; updateUI(); }
      state.cameraX = Math.max(0, player.x - 160);
    }

    function render() {
      ctx.clearRect(0, 0, 512, 320);
      ctx.save();
      ctx.translate(-state.cameraX, 0);

      ctx.fillStyle = '#5c94fc'; ctx.fillRect(state.cameraX, 0, 512, 320);
      ctx.fillStyle = '#ffffff';
      [100, 300, 600, 900, 1100].forEach(cx => {
        ctx.beginPath(); ctx.arc(cx, 60, 18, 0, Math.PI*2); ctx.arc(cx + 14, 55, 22, 0, Math.PI*2); ctx.arc(cx + 30, 60, 18, 0, Math.PI*2); ctx.fill();
      });

      ctx.fillStyle = '#00a800';
      [60, 420, 800].forEach(hx => { ctx.beginPath(); ctx.arc(hx, 280, 50, Math.PI, 0); ctx.fill(); });

      platforms.forEach(p => {
        if (p.type === 'ground') {
          ctx.fillStyle = '#c84c0c'; ctx.fillRect(p.x, p.y, p.w, p.h);
          ctx.fillStyle = '#00a800'; ctx.fillRect(p.x, p.y, p.w, 6);
        } else if (p.type === 'block' || p.type === 'stair') {
          ctx.fillStyle = '#c84c0c'; ctx.fillRect(p.x, p.y, p.w, p.h);
          ctx.strokeStyle = '#000'; ctx.strokeRect(p.x, p.y, p.w, p.h);
        } else if (p.type === 'question') {
          ctx.fillStyle = p.hit ? '#8b5a2b' : '#fc9838'; ctx.fillRect(p.x, p.y, p.w, p.h);
          ctx.strokeStyle = '#000'; ctx.strokeRect(p.x, p.y, p.w, p.h);
          if (!p.hit) { ctx.fillStyle = '#fff'; ctx.font = 'bold 14px monospace'; ctx.fillText('?', p.x + 7, p.y + 17); }
        } else if (p.type === 'pipe') {
          ctx.fillStyle = '#00a800'; ctx.fillRect(p.x, p.y, p.w, p.h);
          ctx.fillStyle = '#00d800'; ctx.fillRect(p.x - 2, p.y, p.w + 4, 10);
          ctx.strokeStyle = '#000'; ctx.strokeRect(p.x - 2, p.y, p.w + 4, 10); ctx.strokeRect(p.x, p.y + 10, p.w, p.h - 10);
        }
      });

      coins.forEach(c => {
        if (c.taken) return;
        ctx.fillStyle = '#fce000'; ctx.beginPath(); ctx.arc(c.x, c.y, 6, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#c88000'; ctx.stroke();
      });

      ctx.fillStyle = '#ffffff'; ctx.fillRect(flagpole.x, flagpole.y, flagpole.w, flagpole.h);
      ctx.fillStyle = '#fc9838'; ctx.beginPath(); ctx.arc(flagpole.x + 4, flagpole.y - 6, 8, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#fc0000'; ctx.beginPath(); ctx.moveTo(flagpole.x, flagpole.y + 10); ctx.lineTo(flagpole.x - 24, flagpole.y + 20); ctx.lineTo(flagpole.x, flagpole.y + 30); ctx.fill();

      enemies.forEach(e => {
        if (!e.alive) return;
        ctx.fillStyle = '#a81000'; ctx.fillRect(e.x, e.y, e.w, e.h);
        ctx.fillStyle = '#fff'; ctx.fillRect(e.x + 3, e.y + 4, 4, 6); ctx.fillRect(e.x + 13, e.y + 4, 4, 6);
        ctx.fillStyle = '#000'; ctx.fillRect(e.x + 5, e.y + 6, 2, 4); ctx.fillRect(e.x + 13, e.y + 6, 2, 4);
      });

      // Mario player
      ctx.fillStyle = '#e52521'; ctx.fillRect(player.x, player.y, player.w, player.h);
      ctx.fillStyle = '#0020c2'; ctx.fillRect(player.x + 2, player.y + 14, player.w - 4, 12);
      ctx.fillStyle = '#fcc082'; ctx.fillRect(player.x + (player.facing === 'right' ? 6 : 2), player.y + 4, 10, 8);
      ctx.fillStyle = '#000000'; ctx.fillRect(player.x + (player.facing === 'right' ? 12 : 4), player.y + 6, 3, 3);
      ctx.fillRect(player.x + (player.facing === 'right' ? 8 : 2), player.y + 10, 8, 3);

      ctx.restore();

      if (state.gameOver) {
        ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, 0, 512, 320);
        ctx.fillStyle = '#ef4444'; ctx.font = 'bold 24px monospace'; ctx.textAlign = 'center'; ctx.fillText('GAME OVER', 256, 140);
        ctx.fillStyle = '#ffffff'; ctx.font = '14px monospace'; ctx.fillText('Click "Play Again" to restart mission', 256, 180);
      } else if (state.won) {
        ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, 0, 512, 320);
        ctx.fillStyle = '#10b981'; ctx.font = 'bold 24px monospace'; ctx.textAlign = 'center'; ctx.fillText('COURSE CLEAR!', 256, 140);
        ctx.fillStyle = '#ffffff'; ctx.font = '14px monospace'; ctx.fillText('Final Score: ' + state.score + ' | Coins: ' + state.coins, 256, 180);
      }
    }

    function loop() { update(); render(); requestAnimationFrame(loop); }
    document.getElementById('restartBtn').onclick = resetGame;
    resetGame(); loop();
  <\/script>
</body>
</html>`}function B6(){return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>COREZ Real-Time Financial Terminal</title>
  <style>
    :root {
      --bg: #09090b;
      --card: #121215;
      --border: #27272a;
      --text: #f4f4f5;
      --muted: #a1a1aa;
      --green: #10b981;
      --red: #ef4444;
      --accent: #6366f1;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; }
    body { background: var(--bg); color: var(--text); min-height: 100vh; padding: 1.5rem; display: flex; flex-direction: column; align-items: center; }
    .terminal-container { width: 100%; max-width: 860px; background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; box-shadow: 0 8px 32px rgba(0,0,0,0.5); }
    .header-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.2rem; flex-wrap: wrap; gap: 0.8rem; border-bottom: 1px solid var(--border); padding-bottom: 0.8rem; }
    .title { font-size: 1.1rem; font-weight: 800; letter-spacing: 0.05em; display: flex; align-items: center; gap: 0.5rem; }
    .status-badge { font-size: 0.7rem; padding: 0.2rem 0.5rem; background: rgba(16, 185, 129, 0.15); color: var(--green); border: 1px solid var(--green); border-radius: 4px; font-weight: 700; text-transform: uppercase; }
    .search-box { display: flex; gap: 0.5rem; width: 100%; max-width: 320px; }
    .search-input { width: 100%; background: var(--bg); border: 1px solid var(--border); color: #fff; padding: 0.5rem 0.8rem; border-radius: 6px; font-size: 0.85rem; }
    .search-input:focus { outline: none; border-color: var(--accent); }
    .ticker-bar { display: flex; gap: 0.6rem; overflow-x: auto; padding-bottom: 0.6rem; margin-bottom: 1rem; border-bottom: 1px solid var(--border); }
    .ticker-chip { background: rgba(255,255,255,0.03); border: 1px solid var(--border); padding: 0.45rem 0.75rem; border-radius: 6px; cursor: pointer; white-space: nowrap; font-size: 0.8rem; transition: 0.2s; }
    .ticker-chip:hover, .ticker-chip.active { background: var(--border); border-color: var(--accent); }
    .main-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 1rem; }
    @media (max-width: 768px) { .main-grid { grid-template-columns: 1fr; } }
    .chart-card { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; }
    .asset-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 1rem; }
    .asset-symbol { font-size: 1.4rem; font-weight: 800; }
    .asset-price { font-size: 1.6rem; font-weight: 800; font-family: monospace; }
    .asset-change { font-size: 0.85rem; font-weight: 700; margin-left: 0.5rem; }
    .asset-change.up { color: var(--green); }
    .asset-change.down { color: var(--red); }
    .timeframes { display: flex; gap: 0.3rem; margin-bottom: 1rem; }
    .tf-btn { background: transparent; border: 1px solid var(--border); color: var(--muted); padding: 0.3rem 0.6rem; border-radius: 4px; font-size: 0.75rem; cursor: pointer; }
    .tf-btn.active { background: #fff; color: #000; font-weight: 700; }
    svg.chart { width: 100%; height: 220px; overflow: visible; }
    .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.6rem; margin-top: 1rem; font-size: 0.8rem; border-top: 1px solid var(--border); padding-top: 0.8rem; }
    .stat-item { display: flex; justify-content: space-between; color: var(--muted); }
    .stat-val { color: var(--text); font-weight: 700; }
    .side-panel { display: flex; flex-direction: column; gap: 1rem; }
    .panel-card { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; }
    .panel-title { font-size: 0.85rem; font-weight: 700; margin-bottom: 0.8rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .converter-row { display: flex; flex-direction: column; gap: 0.6rem; }
    .conv-input { background: var(--card); border: 1px solid var(--border); color: #fff; padding: 0.5rem; border-radius: 6px; font-size: 0.85rem; }
    .conv-result { font-size: 1.1rem; font-weight: 800; color: var(--green); margin-top: 0.4rem; text-align: center; }
  </style>
</head>
<body>
  <div class="terminal-container">
    <div class="header-bar">
      <div class="title">
        <span>COREZ FINANCIAL TERMINAL</span>
        <span class="status-badge">● LIVE DATA</span>
      </div>
      <div class="search-box">
        <input type="text" id="searchInput" class="search-input" placeholder="Search AAPL, NVDA, BTC, EUR/USD...">
      </div>
    </div>

    <div class="ticker-bar" id="tickerBar"></div>

    <div class="main-grid">
      <div class="chart-card">
        <div class="asset-header">
          <div>
            <span class="asset-symbol" id="assetSymbol">AAPL</span>
            <span class="asset-change up" id="assetChange">+1.42%</span>
          </div>
          <div class="asset-price" id="assetPrice">$333.69</div>
        </div>

        <div class="timeframes">
          <button class="tf-btn active">1D</button>
          <button class="tf-btn">1W</button>
          <button class="tf-btn">1M</button>
          <button class="tf-btn">1Y</button>
        </div>

        <svg class="chart" id="chartSvg" viewBox="0 0 500 200"></svg>

        <div class="stats-grid">
          <div class="stat-item"><span>High (24h)</span><span class="stat-val" id="statHigh">$335.20</span></div>
          <div class="stat-item"><span>Low (24h)</span><span class="stat-val" id="statLow">$329.10</span></div>
          <div class="stat-item"><span>Volume</span><span class="stat-val" id="statVol">48.2M</span></div>
          <div class="stat-item"><span>Market Cap</span><span class="stat-val" id="statCap">$5.12T</span></div>
        </div>
      </div>

      <div class="side-panel">
        <div class="panel-card">
          <div class="panel-title">FX & Currency Converter</div>
          <div class="converter-row">
            <input type="number" id="convAmount" class="conv-input" value="100">
            <select id="convFrom" class="conv-input">
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="JPY">JPY (¥)</option>
            </select>
            <select id="convTo" class="conv-input">
              <option value="EUR">EUR (€)</option>
              <option value="USD">USD ($)</option>
              <option value="GBP">GBP (£)</option>
              <option value="JPY">JPY (¥)</option>
            </select>
            <div class="conv-result" id="convResult">€87.66</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const ASSETS = {
      'AAPL': { name: 'Apple Inc.', price: 333.69, change: '+1.42%', high: 335.20, low: 329.10, vol: '48.2M', cap: '$5.12T', points: [329, 330, 331.5, 331, 333, 332.8, 333.69] },
      'NVDA': { name: 'NVIDIA Corp.', price: 207.06, change: '+2.85%', high: 209.40, low: 201.50, vol: '62.4M', cap: '$5.08T', points: [201, 203, 204, 206, 205.5, 208, 207.06] },
      'TSLA': { name: 'Tesla Inc.', price: 379.76, change: '-0.65%', high: 384.10, low: 375.00, vol: '34.8M', cap: '$1.21T', points: [383, 381, 379, 377, 380, 378, 379.76] },
      'BTC': { name: 'Bitcoin', price: 66259.00, change: '+1.30%', high: 66800, low: 65100, vol: '$32.1B', cap: '$1.31T', points: [65100, 65400, 65900, 65700, 66100, 66400, 66259] },
      'ETH': { name: 'Ethereum', price: 1930.83, change: '+0.40%', high: 1955, low: 1910, vol: '$14.2B', cap: '$232B', points: [1910, 1925, 1920, 1940, 1935, 1930, 1930.83] },
      'EUR/USD': { name: 'Euro / USD', price: 1.1407, change: '+0.07%', high: 1.1425, low: 1.1390, vol: 'Forex', cap: 'N/A', points: [1.139, 1.1398, 1.1402, 1.1412, 1.1405, 1.1407] },
      'GOLD': { name: 'Gold Spot', price: 3240.50, change: '+0.85%', high: 3255, low: 3220, vol: 'Futures', cap: 'N/A', points: [3220, 3228, 3235, 3230, 3242, 3240.50] }
    };

    const FX = { USD: 1.0, EUR: 0.8766, GBP: 0.7505, JPY: 148.80 };
    let currentSymbol = 'AAPL';

    function init() {
      renderTickers();
      selectAsset('AAPL');
      setupConverter();
      document.getElementById('searchInput').addEventListener('input', e => {
        const query = e.target.value.toUpperCase().trim();
        if (ASSETS[query]) selectAsset(query);
      });
    }

    function renderTickers() {
      const bar = document.getElementById('tickerBar');
      bar.innerHTML = Object.keys(ASSETS).map(sym => \`
        <div class="ticker-chip \${sym === currentSymbol ? 'active' : ''}" onclick="selectAsset('\${sym}')">
          <b>\${sym}</b> $\${ASSETS[sym].price}
        </div>
      \`).join('');
    }

    function selectAsset(sym) {
      currentSymbol = sym;
      renderTickers();
      const a = ASSETS[sym];
      document.getElementById('assetSymbol').textContent = sym + ' (' + a.name + ')';
      document.getElementById('assetPrice').textContent = (sym.includes('/') || sym === 'GOLD' ? '' : '$') + a.price;
      const chgEl = document.getElementById('assetChange');
      chgEl.textContent = a.change;
      chgEl.className = 'asset-change ' + (a.change.startsWith('+') ? 'up' : 'down');
      document.getElementById('statHigh').textContent = a.high;
      document.getElementById('statLow').textContent = a.low;
      document.getElementById('statVol').textContent = a.vol;
      document.getElementById('statCap').textContent = a.cap;
      renderSVGChart(a.points, a.change.startsWith('+'));
    }

    function renderSVGChart(pts, isUp) {
      const svg = document.getElementById('chartSvg');
      const min = Math.min(...pts), max = Math.max(...pts);
      const range = (max - min) || 1;
      const coords = pts.map((val, idx) => {
        const x = (idx / (pts.length - 1)) * 480 + 10;
        const y = 180 - ((val - min) / range) * 150;
        return \`\${x},\${y}\`;
      }).join(' ');

      const color = isUp ? '#10b981' : '#ef4444';
      svg.innerHTML = \`
        <polyline fill="none" stroke="\${color}" stroke-width="3" points="\${coords}" />
        \${pts.map((val, idx) => {
          const x = (idx / (pts.length - 1)) * 480 + 10;
          const y = 180 - ((val - min) / range) * 150;
          return \`<circle cx="\${x}" cy="\${y}" r="4" fill="\${color}" />\`;
        }).join('')}
      \`;
    }

    function setupConverter() {
      const amount = document.getElementById('convAmount');
      const from = document.getElementById('convFrom');
      const to = document.getElementById('convTo');
      const res = document.getElementById('convResult');
      function calc() {
        const amt = parseFloat(amount.value) || 0;
        const inUSD = amt / FX[from.value];
        const out = inUSD * FX[to.value];
        res.textContent = out.toFixed(2) + ' ' + to.value;
      }
      [amount, from, to].forEach(el => el.addEventListener('input', calc));
      calc();
    }

    init();
  <\/script>
</body>
</html>`}function D6(m){const y=m.trim(),o=y.toLowerCase();if(o.includes("financial")||o.includes("finance")||o.includes("stock")||o.includes("crypto")||o.includes("market")||o.includes("terminal")||o.includes("forex")||o.includes("ticker"))return{title:"COREZ Real-Time Financial Terminal",html:B6()};if(o.includes("mario")||o.includes("platformer")||o.includes("jump")||o.includes("run"))return{title:"COREZ Super Mario World",html:Vu()};if(o.includes("wordle")||o.includes("word")&&o.includes("guess"))return{title:"COREZ Wordle Master",html:_6()};if(o.includes("scrabble")||o.includes("tile")||o.includes("anagram")||o.includes("crossword")||o.includes("word game"))return{title:"COREZ Scrabble Master",html:L6()};if(o.includes("chess")){const b=o.includes("bot")||o.includes("enemy");return{title:b?"COREZ Chess App (vs Bot)":"COREZ Chess App",html:A6(b)}}if(o.includes("space")||o.includes("retro")||o.includes("shooter")||o.includes("arcade")||o.includes("ship"))return{title:"COREZ Retro Space Game",html:O6()};if(o.includes("bot")||o.includes("enemy"))return{title:"COREZ Bot Enemy Simulator",html:I6()};const x=y.replace(/(create|build|make|generate|a|an|the|game|play|app|widget|prototype)/gi,"").trim()||"Interactive App";return{title:`COREZ ${x.charAt(0).toUpperCase()+x.slice(1)} App`,html:Vu()}}async function P6(m){const y=m.trim(),o=y.toLowerCase(),x=Ha(y);if(await new Promise(v=>setTimeout(v,600)),/^(hello|hi|hey|greetings|good morning|good afternoon|good evening|howdy|sup)(\s|!|\.|\?|$)/i.test(o)||o.includes("who are you")||o.includes("what can you do"))return"Hello! I'm COREZ AI. How can I help you today?";if(/^(how are you|how is it going|how's it going)(\s|!|\.|\?|$)/i.test(o))return"Doing great! Ready to help whenever you are. What's on your mind?";if(/^(thanks|thank you|awesome|great|cool|nice|perfect)(\s|!|\.|$)/i.test(o))return"You're very welcome! Let me know if there's anything else I can help with.";if(x.type==="app"){const v=D6(y);return`I've created **${v.title}** for you! Click below to open it live in the preview canvas on the right side.

\`\`\`html
${v.html}
\`\`\``}return x.type==="code-help"?`I understand the goal: ${x.summary}

Share the snippet, error message, or file you are working on. I’ll walk through what is happening, identify the likely cause, propose a fix, and explain how to verify it so you can move forward without guessing.`:x.type==="writing"?`I understand the goal: ${x.summary}

Send me the rough text, audience, and tone you want. I’ll turn it into clear public-facing copy, tighten the message, and give you a polished version plus a short explanation of why it works.`:x.type==="explanation"?`I understand the goal: ${x.summary}

Here’s the useful way to think about **"${y}"**:

Start with the core idea, then connect it to what the user is trying to accomplish. From there, separate the topic into simple parts, explain why each part matters, and end with the next action someone should take. If you want, I can also turn this into a step-by-step guide or a shorter public-facing explanation.`:`I understand the goal: ${x.summary}

For **"${y}"**, I’ll focus on what the public user is trying to accomplish and give a practical path forward.

A good next step is to define the outcome, the audience, and the format you want. Once those are clear, I can help turn the idea into a plan, a written answer, code, or a live preview depending on what you need.`}const M6=/\b(generate|create|draw|make|render|show|flux)\b.*\b(image|picture|photo|logo|illustration|artwork|wallpaper|drawing|graphic)\b|\b(image|picture|photo|logo|illustration|artwork|wallpaper|drawing|graphic)\b.*\b(generate|create|draw|make|render|flux)\b/i;async function Yu(m,y=[],o=null){const x=m.trim();if(y.length<=1&&(M6.test(x)||x.toLowerCase().startsWith("image:")||x.toLowerCase().startsWith("flux:")))try{const b=await za(x,o);if(b)return`Here is your generated image:

![${x}](${b})`}catch(b){if((b==null?void 0:b.name)==="AbortError")throw b;console.warn("FLUX image generation error; falling back to standard text response.",b)}const v=Ha(x);try{const b=await N6(x,v,y,o);if(b){const I=b.match(/\[IMAGE_PROMPT:\s*(.*?)\]/i);if(I){const z=I[1].trim();try{const N=await za(z,o);if(N)return b.replace(I[0],`![${z}](${N})`)}catch(N){if((N==null?void 0:N.name)==="AbortError")throw N;console.warn("FLUX image generation error from AI tag.",N)}}return b}}catch(b){if((b==null?void 0:b.name)==="AbortError")throw b;console.warn("Hosted AI unavailable; using local Corez fallback.",b)}return P6(x)}function nc(){const[m,y]=q.useState(6);q.useEffect(()=>{const x=setInterval(()=>{y(v=>v<65?v+Math.random()*1.5+.6:v<88?v+Math.random()*.6+.25:v<98.5?v+Math.random()*.15+.05:v)},220);return()=>clearInterval(x)},[]);const o=Math.min(Math.round(m),99);return u.jsxs("div",{className:"square-worm-progress-container",role:"status","aria-live":"polite",children:[u.jsx("div",{className:"square-worm-header",children:u.jsxs("span",{className:"square-worm-percentage",children:[o,"%"]})}),u.jsxs("div",{className:"square-worm-track-wrapper",children:[u.jsx("div",{className:"square-worm-track-bg"}),u.jsx("div",{className:"square-worm-head-wrapper",style:{width:`${Math.min(m,100)}%`},children:u.jsxs("div",{className:"square-worm-body",children:[u.jsx("span",{className:"worm-pixel seg-tail"}),u.jsx("span",{className:"worm-pixel seg-mid"}),u.jsx("span",{className:"worm-pixel seg-head",children:u.jsx("span",{className:"worm-eye"})})]})})]})]})}function W6(){const[m,y]=q.useState(""),[o,x]=q.useState([]),[v,b]=q.useState(!1),[I,z]=q.useState(()=>{try{const A=localStorage.getItem("corez_generated_images");return A?JSON.parse(A):[]}catch{return[]}}),[N,H]=q.useState(null),[U,T]=q.useState(null),L=q.useRef(null),$=q.useRef(null);q.useEffect(()=>{try{localStorage.setItem("corez_generated_images",JSON.stringify(I))}catch(A){console.warn("Failed to save generated images to localStorage",A)}},[I]),q.useEffect(()=>{L.current&&(L.current.style.height="auto",L.current.style.height=`${Math.min(L.current.scrollHeight,140)}px`)},[m]);const P=A=>{!A||A.length===0||Array.from(A).forEach(ie=>{const te=Date.now()+Math.random(),ne=ie.type.startsWith("image/"),be=new FileReader;ne?(be.onload=ue=>{x(Oe=>[...Oe,{id:te,name:ie.name,type:"image",dataUrl:ue.target.result}])},be.readAsDataURL(ie)):(be.onload=ue=>{x(Oe=>[...Oe,{id:te,name:ie.name,type:"document",text:ue.target.result}])},be.readAsText(ie))})},W=A=>{P(A.target.files),$.current&&($.current.value="")},Q=A=>{var ie,te;A.preventDefault(),A.stopPropagation(),((te=(ie=A.dataTransfer)==null?void 0:ie.files)==null?void 0:te.length)>0&&P(A.dataTransfer.files)},he=A=>{A.preventDefault(),A.stopPropagation()},ce=A=>{x(ie=>ie.filter(te=>te.id!==A))},me=async A=>{const ie=typeof A=="string"?A:m.trim();if(!ie&&o.length===0||v)return;let te=ie;const ne=o.filter(ue=>ue.type==="document"&&ue.text).map(ue=>ue.text.slice(0,500));ne.length>0&&(te+=` [Document Context: ${ne.join("; ")}]`);const be=o.filter(ue=>ue.type==="image").length;be>0&&(te+=` [Image Reference Attached: ${be} image(s)]`),b(!0),y(""),x([]),L.current&&(L.current.style.height="auto");try{const ue=await za(te);if(ue){const Oe={id:Date.now(),prompt:te,url:ue,createdAt:new Date().toISOString()};z(Ve=>[Oe,...Ve])}}catch(ue){console.error("Image generation error:",ue)}finally{b(!1)}},oe=A=>{A==null||A.preventDefault(),me(m.trim())},He=A=>{A.key==="Enter"&&!A.shiftKey&&(A.preventDefault(),oe())},Ce=(A,ie)=>{navigator.clipboard.writeText(ie),T(A),setTimeout(()=>T(null),2e3)},Ae=(A,ie)=>{ie==null||ie.stopPropagation(),z(te=>te.filter(ne=>ne.id!==A))};return u.jsxs("div",{className:"chat-pane studio-pane",children:[u.jsx("div",{className:"messages-scroll studio-scroll",children:I.length===0&&!v?u.jsxs("div",{className:"welcome-container",children:[u.jsx("h1",{className:"welcome-title",children:"COREZ STUDIO"}),u.jsx("p",{style:{color:"var(--text-secondary)",fontSize:"0.85rem",marginBottom:"1.25rem"},children:"Create high-quality 8-bit game assets, pixel art sprites, and visual artwork"}),u.jsxs("div",{style:{display:"flex",flexWrap:"wrap",gap:"0.5rem",justifyContent:"center",maxWidth:"640px"},children:[u.jsx("button",{type:"button",className:"code-btn",style:{padding:"6px 12px",fontSize:"0.78rem",borderRadius:"var(--radius-pill)",backgroundColor:"var(--bg-tertiary)"},onClick:()=>me("8-bit pixel art knight sprite sheet, 16x16 pixel grid, itch.io game asset, PICO-8 retro palette, crisp outline"),children:"⚔️ 8-Bit Knight Sprites"}),u.jsx("button",{type:"button",className:"code-btn",style:{padding:"6px 12px",fontSize:"0.78rem",borderRadius:"var(--radius-pill)",backgroundColor:"var(--bg-tertiary)"},onClick:()=>me("8-bit pixel art RPG items set, potion flasks, enchanted swords, shields, treasure chest, itch.io 8-bit game asset style"),children:"🛡️ 8-Bit Weapons & Potions"}),u.jsx("button",{type:"button",className:"code-btn",style:{padding:"6px 12px",fontSize:"0.78rem",borderRadius:"var(--radius-pill)",backgroundColor:"var(--bg-tertiary)"},onClick:()=>me("8-bit pixel art retro dungeon tileset, stone brick walls, floor tiles, torch, door, lava, itch.io 8-bit game asset pack"),children:"🏰 8-Bit Dungeon Tileset"}),u.jsx("button",{type:"button",className:"code-btn",style:{padding:"6px 12px",fontSize:"0.78rem",borderRadius:"var(--radius-pill)",backgroundColor:"var(--bg-tertiary)"},onClick:()=>me("8-bit retro arcade monster sprites, slime, goblin, dragon, skull, itch.io 8-bit game asset tag style, vibrant NES palette"),children:"👾 8-Bit Arcade Monsters"})]})]}):u.jsxs("div",{className:"messages-inner studio-messages-inner",children:[u.jsxs("div",{className:"showcase-header-row",children:[u.jsxs("div",{className:"showcase-title",children:[u.jsx(Zu,{size:16,strokeWidth:1.5}),u.jsxs("span",{children:["Image Showcase (",I.length,")"]})]}),I.length>0&&u.jsxs("button",{className:"code-btn clear-all-btn",onClick:()=>z([]),title:"Clear Showcase",children:[u.jsx(Ui,{size:12,strokeWidth:1.5}),u.jsx("span",{children:"Clear All"})]})]}),v&&u.jsx("div",{className:"message-wrapper ai",children:u.jsx("div",{className:"message-body",children:u.jsx(nc,{taskType:"image",customTitle:"Generating Visual Artwork"})})}),I.length>0&&u.jsx("div",{className:"showcase-images-grid",children:I.map((A,ie)=>u.jsxs("div",{className:`showcase-img-card ${ie===0?"latest-card":""}`,onClick:()=>H(A.url),children:[u.jsxs("div",{className:"showcase-img-wrapper",children:[u.jsx("img",{src:A.url,alt:A.prompt,className:"showcase-img"}),u.jsxs("div",{className:"showcase-img-overlay",children:[u.jsx("button",{className:"icon-btn overlay-btn",onClick:te=>{te.stopPropagation(),H(A.url)},title:"Enlarge Image",children:u.jsx(Ju,{size:15,strokeWidth:1.5})}),u.jsx("button",{className:"icon-btn overlay-btn delete-btn",onClick:te=>Ae(A.id,te),title:"Delete Image",children:u.jsx(Ui,{size:14,strokeWidth:1.5})})]})]}),u.jsxs("div",{className:"showcase-card-caption",children:[u.jsx("p",{className:"caption-text",children:A.prompt}),u.jsxs("div",{className:"caption-actions",children:[u.jsx("button",{className:"code-btn",onClick:te=>{te.stopPropagation(),Ce(A.id,A.prompt)},title:"Copy Prompt",children:U===A.id?u.jsx(Ga,{size:12,strokeWidth:1.5}):u.jsx(Fa,{size:12,strokeWidth:1.5})}),u.jsx("a",{href:A.url,download:`generated-image-${A.id}.png`,className:"code-btn download-btn",onClick:te=>te.stopPropagation(),title:"Download Image",children:u.jsx(Xu,{size:12,strokeWidth:1.5})})]})]})]},A.id))})]})}),u.jsx("div",{className:"chat-input-container",children:u.jsxs("form",{onSubmit:oe,className:"input-box studio-input-box",onDrop:Q,onDragOver:he,children:[u.jsx("input",{type:"file",ref:$,onChange:W,style:{display:"none"},multiple:!0,accept:"image/*,.pdf,.txt,.md,.csv,.json"}),u.jsx("button",{type:"button",className:"icon-btn attach-file-btn",onClick:()=>{var A;return(A=$.current)==null?void 0:A.click()},title:"Attach Document or Image",disabled:v,children:u.jsx(Gd,{size:16,strokeWidth:1.5})}),u.jsxs("div",{className:"input-textarea-wrapper",style:{flex:1,display:"flex",flexDirection:"column"},children:[o.length>0&&u.jsx("div",{className:"attachment-chips-bar",children:o.map(A=>u.jsxs("div",{className:"attachment-chip",children:[A.type==="image"?u.jsx("img",{src:A.dataUrl,alt:A.name,className:"attachment-chip-thumb"}):u.jsx(xd,{size:13,strokeWidth:1.5}),u.jsx("span",{className:"chip-filename",children:A.name}),u.jsx("button",{type:"button",className:"remove-chip-btn",onClick:()=>ce(A.id),title:"Remove attachment",children:u.jsx(Gi,{size:12,strokeWidth:1.5})})]},A.id))}),u.jsx("textarea",{ref:L,className:"chat-textarea",value:m,onChange:A=>y(A.target.value),onKeyDown:He,placeholder:"Imagine with Corez...",rows:1,disabled:v})]}),u.jsx("div",{className:"input-actions-bar",children:u.jsx("button",{type:"submit",className:"send-btn",disabled:!m.trim()&&o.length===0||v,title:"Generate Image",children:v?u.jsx(Rd,{size:15,strokeWidth:1.5,className:"spin-icon"}):u.jsx(ec,{size:15,strokeWidth:1.5})})})]})}),N&&u.jsx("div",{className:"image-lightbox-modal",onClick:()=>H(null),children:u.jsxs("div",{className:"lightbox-content",onClick:A=>A.stopPropagation(),children:[u.jsx("img",{src:N,alt:"Preview Image",className:"lightbox-img"}),u.jsx("button",{className:"icon-btn close-lightbox",onClick:()=>H(null),children:u.jsx(Gi,{size:16,strokeWidth:1.5})})]})})]})}function Wa(m){if(!m||m.length===0)return"general";const y=[...m].reverse().find(x=>x.role==="user");if(!y)return"general";const o=typeof y.content=="string"?y.content.toLowerCase():"";return o.includes("game")||o.includes("play")||o.includes("chess")||o.includes("space")||o.includes("scrabble")||o.includes("wordle")||o.includes("bot")||o.includes("enemy")?"game":o.includes("image")||o.includes("flux")||o.includes("picture")||o.includes("photo")||o.includes("draw")?"image":o.includes("build")||o.includes("make")||o.includes("app")||o.includes("website")||o.includes("site")||o.includes("dashboard")||o.includes("landing")?"app":o.includes("code")||o.includes("fix")||o.includes("bug")||o.includes("error")||o.includes("function")?"code":"general"}const Or=[{id:"session-default",title:"New Conversation",messages:[]}];function j6(){const[m,y]=q.useState(()=>{const C=localStorage.getItem("corez_sessions");return C?JSON.parse(C):Or}),[o,x]=q.useState(()=>{var C;return((C=m[0])==null?void 0:C.id)||"session-default"}),[v,b]=q.useState("chat"),[I,z]=q.useState(()=>typeof window>"u"?!0:!window.matchMedia("(max-width: 767px)").matches),[N,H]=q.useState(!1),[U,T]=q.useState(!1),[L,$]=q.useState(""),[P,W]=q.useState(!1),[Q,he]=q.useState(!1),[ce,me]=q.useState(!1),[oe,He]=q.useState(()=>localStorage.getItem("corez_theme")||"dark"),[Ce,Ae]=q.useState(()=>typeof window>"u"?!1:window.matchMedia("(max-width: 767px)").matches),A=q.useRef(null),ie=q.useRef(null),te=q.useRef(null);q.useEffect(()=>{const C=window.matchMedia("(max-width: 767px)"),F=Z=>{Ae(Z.matches),Z.matches&&z(!1)};return Ae(C.matches),C.addEventListener("change",F),()=>C.removeEventListener("change",F)},[]),q.useEffect(()=>{const C=F=>{F.key==="Escape"&&Ce&&I&&z(!1)};return window.addEventListener("keydown",C),()=>window.removeEventListener("keydown",C)},[Ce,I]),q.useEffect(()=>{localStorage.setItem("corez_sessions",JSON.stringify(m))},[m]),q.useEffect(()=>{document.documentElement.setAttribute("data-theme",oe),localStorage.setItem("corez_theme",oe)},[oe]),q.useEffect(()=>{try{const C=localStorage.getItem("corez_pending_request");if(C){const F=JSON.parse(C);if(F&&F.sessionId&&Date.now()-(F.timestamp||0)<3e5)if(m.find(le=>le.id===F.sessionId)){he(!0);const le=new AbortController;te.current=le,Yu(F.apiPrompt,F.messages,le.signal).then(ee=>{if(!ee)return;const pe=Ku(ee);pe&&$(pe);const Le={role:"assistant",content:ee};y(Dt=>Dt.map(at=>{if(at.id===F.sessionId){const et=at.messages[at.messages.length-1];return(et==null?void 0:et.role)==="assistant"&&(et==null?void 0:et.content)===ee?at:{...at,messages:[...at.messages,Le]}}return at}))}).catch(ee=>{(ee==null?void 0:ee.name)!=="AbortError"&&console.warn("Background AI response recovery error:",ee)}).finally(()=>{localStorage.removeItem("corez_pending_request"),he(!1),te.current=null})}else localStorage.removeItem("corez_pending_request");else localStorage.removeItem("corez_pending_request")}}catch(C){console.warn("Failed to parse corez_pending_request",C),localStorage.removeItem("corez_pending_request")}},[]);const ne=m.find(C=>C.id===o)||m[0];q.useEffect(()=>{var C;v==="chat"&&((C=A.current)==null||C.scrollIntoView({behavior:"smooth"}))},[ne==null?void 0:ne.messages,Q,v]);const be=C=>{x(C),b("chat")},ue=()=>{const C=`session-${Date.now()}`;y([{id:C,title:"New Conversation",messages:[]},...m]),x(C),b("chat")},Oe=C=>{var Z;const F=m.filter(le=>le.id!==C);y(F.length?F:Or),o===C&&x(((Z=F[0])==null?void 0:Z.id)||Or[0].id)},Ve=()=>{y(Or),x(Or[0].id),$(""),W(!1)},je=C=>{$(C),H(!0)},xe=()=>{te.current&&(te.current.abort(),te.current=null),localStorage.removeItem("corez_pending_request"),he(!1)},O=async C=>{if(!ne)return;let F=C,Z=C;d&&(Z=`[Context: The user is requesting a revision for the following code block]
\`\`\`
${d}
\`\`\`

User Request: ${C}`,w(""));const le={role:"user",content:F},ee={role:"user",content:Z},pe=[...ne.messages,le],Le=[...ne.messages,ee],Dt=ne.messages.length===0?C.length>30?C.slice(0,27)+"...":C:ne.title;y(tt=>tt.map(Tt=>Tt.id===o?{...Tt,title:Dt,messages:pe}:Tt));const at=R6(C);me(at),he(!0);const et={sessionId:o,apiPrompt:Z,displayPrompt:F,messages:Le,timestamp:Date.now()};localStorage.setItem("corez_pending_request",JSON.stringify(et));const mn=new AbortController;te.current=mn;try{const tt=await Yu(Z,Le,mn.signal);if(tt){const Tt=Ku(tt);Tt&&$(Tt);const Gn={role:"assistant",content:tt};y(Ir=>Ir.map(Pt=>Pt.id===o?{...Pt,messages:[...Pt.messages,Gn]}:Pt))}}catch(tt){(tt==null?void 0:tt.name)!=="AbortError"&&console.error("AI generation error:",tt)}finally{localStorage.removeItem("corez_pending_request"),he(!1),me(!1),te.current=null}},[Y,B]=q.useState(""),[d,w]=q.useState(""),J=C=>{w(C);const F="Revise code: ";B(F),ie.current&&setTimeout(()=>{ie.current.focus(),ie.current.setSelectionRange(F.length,F.length)},50)};return u.jsxs("div",{className:"app-container",children:[u.jsx(o6,{isOpen:I,sessions:m,activeSessionId:o,onSelectSession:be,onNewChat:ue,onDeleteSession:Oe,onOpenSettings:()=>W(!0),onOpenImageShowcase:()=>b("image-studio"),activeView:v,theme:oe,onToggleTheme:()=>He(C=>C==="dark"?"light":"dark"),onCloseSidebar:()=>z(!1)}),Ce&&I&&u.jsx("button",{type:"button",className:"sidebar-backdrop","aria-label":"Close sidebar",onClick:()=>z(!1)}),u.jsx("main",{className:"main-content",children:v==="image-studio"?u.jsx(W6,{}):u.jsxs(u.Fragment,{children:[u.jsxs("div",{className:`chat-pane ${N?"canvas-active":""}`,children:[u.jsx(s6,{sidebarOpen:I,onToggleSidebar:()=>z(C=>!C),canvasOpen:N,onToggleCanvas:()=>H(C=>!C),hasExecutableCode:!!L}),u.jsx("div",{className:"messages-scroll",children:(ne==null?void 0:ne.messages.length)===0?u.jsx("div",{className:"welcome-container",children:u.jsx("h1",{className:"welcome-title",children:"COREZ"})}):u.jsxs("div",{className:"messages-inner",children:[ne==null?void 0:ne.messages.map((C,F)=>u.jsx(c6,{message:C,onRunInCanvas:je,onReviseCode:J},F)),Q&&u.jsx("div",{className:`message-wrapper ai ${ce||Wa(ne==null?void 0:ne.messages)==="game"?"game-dev-loading":""}`,children:u.jsx("div",{className:"message-body",style:ce||Wa(ne==null?void 0:ne.messages)==="game"?{width:"100%",maxWidth:"100%"}:void 0,children:ce||Wa(ne==null?void 0:ne.messages)==="game"?u.jsx(nc,{}):u.jsxs("div",{className:"thinking-indicator-box","aria-label":"Corez is thinking",role:"status",children:[u.jsx("span",{className:"thinking-text",children:"Thinking..."}),u.jsxs("span",{className:"thinking-dots","aria-hidden":"true",children:[u.jsx("span",{className:"thinking-dot"}),u.jsx("span",{className:"thinking-dot"}),u.jsx("span",{className:"thinking-dot"})]})]})})}),u.jsx("div",{ref:A})]})}),u.jsx(p6,{input:Y,setInput:B,textareaRef:ie,onSendMessage:O,onStopMessage:xe,isStreaming:Q})]}),N&&u.jsx(d6,{code:L,onClose:()=>H(!1),isFullScreen:U,onToggleFullScreen:()=>T(C=>!C)})]})}),u.jsx(f6,{isOpen:P,onClose:()=>W(!1),onClearAllHistory:Ve})]})}ud.createRoot(document.getElementById("root")).render(u.jsx(nd.StrictMode,{children:u.jsx(j6,{})}));
