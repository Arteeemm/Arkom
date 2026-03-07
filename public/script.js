const socket = io()

const username = localStorage.getItem("username")

function sendMessage(){

    const text = document.getElementById("message").value

    socket.emit("send_message",{
        sender: username,
        text: text
    })

}

socket.on("receive_message",(data)=>{

    const div = document.createElement("div")
    div.innerText = data.sender + ": " + data.text

    document.getElementById("messages").appendChild(div)

})
