import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
window.React = React

const App = () => {
  const [num, setNum] = useState(101)
  // window.setNum = setNum
  const arr = num % 2 ? [
    <li key='3'>3</li>,
    <li key='2'>2</li>,
    <li key='1'>1</li>
  ] : [
    <li key='1'>1</li>,
    <li key='2'>2</li>,
    <li key='3'>3</li>
  ]
  return <ul onClickCapture={() => {
    setNum(num + 1)
  }}>{arr}</ul>
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
